import { WifiOff, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Image from 'next/image'
import Link from 'next/link'
import { OfflineSnapshotViewer } from '@/components/offline-snapshot-viewer'

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="flex w-full max-w-4xl flex-col items-center text-center">
        <div className="relative mx-auto h-24 w-24">
          <Image
            src="/exclusiv-art-logo.png"
            alt="ExclusivArt"
            fill
            className="object-contain opacity-70"
          />
        </div>
        
        <div className="mt-6 space-y-2">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <WifiOff className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">
            Voce esta offline
          </h1>
          <p className="text-muted-foreground text-sm">
            Verifique sua conexao com a internet e tente novamente.
          </p>
        </div>

        <div className="mt-6 w-full max-w-sm space-y-3">
          <Button asChild className="w-full">
            <Link href="/dashboard">
              <RefreshCw className="mr-2 h-4 w-4" />
              Tentar Novamente
            </Link>
          </Button>
          <p className="text-xs text-muted-foreground">
            Algumas funcoes podem estar disponiveis offline.
          </p>
        </div>

        <OfflineSnapshotViewer />
      </div>
    </div>
  )
}
