'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[exclusivart-client] dashboard_error', {
      digest: error.digest,
      name: error.name,
    })
  }, [error])

  return (
    <div className="flex min-h-[60svh] items-center justify-center px-4">
      <div className="max-w-md rounded-2xl border border-[#eadff4] bg-white p-6 text-center shadow-[0_16px_45px_rgba(83,48,122,0.06)]">
        <AlertTriangle className="mx-auto h-10 w-10 text-[#8d6dcc]" />
        <h1 className="mt-4 text-xl font-semibold text-[#15142a]">
          Nao foi possivel carregar o painel
        </h1>
        <p className="mt-2 text-sm leading-6 text-[#706b82]">
          A conexao com os dados falhou. Tente novamente ou entre pelo login.
        </p>
        <div className="mt-5 flex justify-center gap-3">
          <Button type="button" onClick={reset}>
            Tentar novamente
          </Button>
          <Button asChild variant="outline">
            <a href="/login">Login</a>
          </Button>
        </div>
      </div>
    </div>
  )
}
