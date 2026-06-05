'use client'

import { useEffect } from 'react'

export default function HomePage() {
  useEffect(() => {
    window.location.replace('/dashboard')
  }, [])

  return (
    <main className="flex min-h-svh items-center justify-center bg-[#fbf8ff] px-6 text-center text-[#332947]">
      <div className="space-y-4">
        <img
          src="/exclusiv-art-logo.png"
          alt="Exclusiv Art"
          className="mx-auto h-24 w-auto object-contain"
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
