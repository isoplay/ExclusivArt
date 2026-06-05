'use client'

import { useEffect, useState } from 'react'
import { Package, Boxes } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatSnapshotDate, readOfflineSnapshot, type OfflineSnapshot } from '@/lib/offline-cache'

function SnapshotList({
  title,
  description,
  icon: Icon,
  items,
}: {
  title: string
  description: string
  icon: typeof Package
  items: OfflineSnapshot['materiais']
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-5 w-5" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Abra esta area online uma vez para salvar uma leitura offline.
          </p>
        ) : (
          items.slice(0, 20).map((item) => (
            <div key={item.id} className="rounded-lg border bg-background p-3 text-left">
              <p className="truncate text-sm font-medium">{item.nome}</p>
              <p className="truncate text-xs text-muted-foreground">
                {[item.subtitulo, item.detalhe, item.estoque].filter(Boolean).join(' | ')}
              </p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

export function OfflineSnapshotViewer() {
  const [snapshot, setSnapshot] = useState<OfflineSnapshot | null>(null)

  useEffect(() => {
    const update = () => setSnapshot(readOfflineSnapshot())
    update()
    window.addEventListener('storage', update)
    window.addEventListener('exclusiv-art:offline-snapshot-updated', update)

    return () => {
      window.removeEventListener('storage', update)
      window.removeEventListener('exclusiv-art:offline-snapshot-updated', update)
    }
  }, [])

  if (!snapshot) return null

  return (
    <div className="mt-6 w-full max-w-3xl space-y-4 text-left">
      <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        Ultima leitura salva: {formatSnapshotDate(snapshot.updatedAt)}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <SnapshotList
          title="Materiais salvos"
          description="Estoque e tipos para consulta rapida"
          icon={Boxes}
          items={snapshot.materiais}
        />
        <SnapshotList
          title="Produtos salvos"
          description="Preco e mao de obra para consulta"
          icon={Package}
          items={snapshot.produtos}
        />
      </div>
    </div>
  )
}
