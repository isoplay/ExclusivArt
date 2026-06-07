'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Download, X, Smartphone } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    setIsStandalone(standalone)

    // iPadOS moderno se apresenta como Mac, mas ainda expõe touch points.
    const ua = navigator.userAgent
    const iosUA = /iPad|iPhone|iPod/.test(ua)
    const isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
    const ios = iosUA || isIPadOS
    setIsIOS(ios)

    const dismissed = localStorage.getItem('pwa-prompt-dismissed')
    const dismissedTime = dismissed ? parseInt(dismissed, 10) : 0
    const sevenDays = 7 * 24 * 60 * 60 * 1000
    const wasDismissedRecently =
      Number.isFinite(dismissedTime) && Date.now() - dismissedTime < sevenDays

    if (standalone || wasDismissedRecently) {
      return
    }

    let promptTimeout: NodeJS.Timeout | undefined
    let iosTimeout: NodeJS.Timeout | undefined

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      promptTimeout = setTimeout(() => {
        setShowPrompt(true)
      }, 30000)
    }

    window.addEventListener('beforeinstallprompt', handler)

    // iOS nao dispara beforeinstallprompt; mostramos a instrucao manual depois de um tempo.
    if (ios && !standalone) {
      iosTimeout = setTimeout(() => {
        setShowPrompt(true)
      }, 60000)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      if (promptTimeout) clearTimeout(promptTimeout)
      if (iosTimeout) clearTimeout(iosTimeout)
    }
  }, [])

  async function handleInstall() {
    if (!deferredPrompt) return

    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice

    if (outcome === 'accepted') {
      setShowPrompt(false)
    }
    setDeferredPrompt(null)
  }

  function handleDismiss() {
    setShowPrompt(false)
    // Evita insistir no aviso toda vez que a dona abrir o app.
    localStorage.setItem('pwa-prompt-dismissed', Date.now().toString())
  }

  if (isStandalone || !showPrompt) return null

  return (
    <div className="fixed bottom-4 left-4 right-[4.25rem] z-50 md:left-auto md:right-4 md:w-80">
      <Card className="border-primary/20 shadow-lg">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Instalar App</CardTitle>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 -mt-1 -mr-1"
              onClick={handleDismiss}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription className="text-xs">
            Instale o Exclusiv Art no seu celular para acesso rapido
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {isIOS ? (
            <div className="text-xs text-muted-foreground space-y-2">
              <p>Para instalar no iPhone/iPad:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Toque no botao de compartilhar</li>
                <li>Role e toque em &quot;Adicionar a Tela de Inicio&quot;</li>
                <li>Toque em &quot;Adicionar&quot;</li>
              </ol>
            </div>
          ) : (
            <Button onClick={handleInstall} className="w-full" size="sm">
              <Download className="mr-2 h-4 w-4" />
              Instalar Agora
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
