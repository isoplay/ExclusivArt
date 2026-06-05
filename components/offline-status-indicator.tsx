'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatSnapshotDate, readOfflineSnapshot, type OfflineSnapshot } from '@/lib/offline-cache'

export function OfflineStatusIndicator() {
  const [isOnline, setIsOnline] = useState(true)
  const [snapshot, setSnapshot] = useState<OfflineSnapshot | null>(null)

  useEffect(() => {
    const updateStatus = () => {
      setIsOnline(navigator.onLine)
      setSnapshot(readOfflineSnapshot())
    }

    updateStatus()
    window.addEventListener('online', updateStatus)
    window.addEventListener('offline', updateStatus)
    window.addEventListener('exclusiv-art:offline-snapshot-updated', updateStatus)

    return () => {
      window.removeEventListener('online', updateStatus)
      window.removeEventListener('offline', updateStatus)
      window.removeEventListener('exclusiv-art:offline-snapshot-updated', updateStatus)
    }
  }, [])

  if (isOnline) return null

  const materialCount = snapshot?.materiais.length ?? 0
  const productCount = snapshot?.produtos.length ?? 0

  return (
    <div className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 md:left-auto md:w-[420px]">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950 shadow-lg">
        <div className="flex items-start gap-3">
          <WifiOff className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Sem internet no momento</p>
            <p className="mt-1 text-xs">
              Leitura salva: {materialCount} materiais e {productCount} produtos. Ultima
              sync: {formatSnapshotDate(snapshot?.updatedAt ?? '')}.
            </p>
          </div>
          <Button asChild size="sm" variant="outline" className="h-8 bg-white/80">
            <Link href="/offline">Ver</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
