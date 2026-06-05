'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[exclusivart-client] global_error', {
      digest: error.digest,
      message: error.message,
    })
  }, [error])

  return (
    <main className="flex min-h-svh items-center justify-center bg-[#fbf8ff] px-6 text-center text-[#332947]">
      <div className="max-w-sm space-y-4">
        <img
          src="/exclusiv-art-logo.png"
          alt="Exclusiv Art"
          className="mx-auto h-24 w-auto object-contain"
        />
        <h1 className="text-xl font-semibold">Nao foi possivel carregar</h1>
        <p className="text-sm leading-6 text-[#5f536f]">
          Recarregue a pagina. Se continuar, abra novamente pelo login.
        </p>
        <div className="flex justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-11 items-center justify-center rounded-full bg-[#8d6dcc] px-5 text-sm font-semibold text-white"
          >
            Tentar novamente
          </button>
          <a
            href="/login"
            className="inline-flex h-11 items-center justify-center rounded-full border border-[#d8cfe8] bg-white px-5 text-sm font-semibold text-[#5f536f]"
          >
            Login
          </a>
        </div>
      </div>
    </main>
  )
}
