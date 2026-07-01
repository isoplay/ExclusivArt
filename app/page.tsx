'use client'

import { useEffect } from 'react'
import { BRAND_LOGO, BRAND_NAME } from '@/lib/brand'

export default function HomePage() {
  useEffect(() => {
    window.location.replace('/dashboard')
  }, [])

  return (
    <main className="flex min-h-svh items-center justify-center bg-[#fbf8ff] px-6 text-center text-[#332947]">
      <div className="space-y-4">
        <img
          src={BRAND_LOGO}
          alt={BRAND_NAME}
          className="mx-auto aspect-[691/361] w-full max-w-[300px] object-contain drop-shadow-[0_16px_28px_rgba(92,61,142,0.2)]"
        />
        <p className="text-sm text-[#5f536f]">Abrindo o sistema...</p>
        <a
          href="/dashboard"
          className="inline-flex h-11 items-center justify-center rounded-full bg-[#8d6dcc] px-5 text-sm font-semibold text-white"
        >
          Entrar no painel
        </a>
      </div>
    </main>
  )
}
