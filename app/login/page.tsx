import { login } from './actions'
import { LockKeyhole, Mail, Sparkles } from 'lucide-react'
import { BRAND_LOGO, BRAND_NAME } from '@/lib/brand'

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>
}) {
  const params = await searchParams
  const error = params?.error

  return (
    <main className="login-shell relative isolate flex min-h-[100svh] w-full overflow-hidden px-4 py-7 text-[#332947] sm:px-6">
      <div aria-hidden className="login-aurora absolute inset-0 -z-20" />

      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <SparkleMark className="left-[9%] top-[12%] h-5 w-5 rotate-12 opacity-55" />
        <SparkleMark className="right-[10%] top-[18%] h-4 w-4 -rotate-6 opacity-50 [animation-delay:-2s]" />
        <SparkleMark className="left-[15%] bottom-[20%] h-4 w-4 rotate-45 opacity-45 [animation-delay:-4s]" />
        <SparkleMark className="right-[17%] bottom-[14%] h-6 w-6 rotate-12 opacity-45 [animation-delay:-6s]" />
        <SparkleMark className="left-[49%] top-[6%] h-3.5 w-3.5 -rotate-12 opacity-55 [animation-delay:-3s]" />
        <svg
          className="absolute inset-x-0 top-[14%] hidden h-32 w-full text-[#8e6ec8]/20 sm:block"
          viewBox="0 0 1200 260"
          fill="none"
          preserveAspectRatio="none"
        >
          <path
            d="M-80 145 C150 40 315 210 530 110 C760 4 900 180 1280 80"
            stroke="currentColor"
            strokeWidth="1"
            strokeDasharray="2 10"
          />
        </svg>
      </div>

      <section className="relative mx-auto flex min-h-[calc(100svh-3.5rem)] w-full max-w-[400px] flex-col justify-center py-2">
        <div className="login-rise mb-9 flex justify-center">
          <img
            src={BRAND_LOGO}
            alt={BRAND_NAME}
            className="aspect-[691/361] w-full max-w-[310px] object-contain drop-shadow-[0_18px_30px_rgba(92,61,142,0.22)]"
          />
        </div>

        <div className="login-glass login-rise p-6 shadow-[0_28px_76px_-34px_rgba(92,61,142,0.46)] [animation-delay:120ms] sm:p-8">
          <header className="mb-7 text-center">
            <h1 className="login-title text-3xl font-medium tracking-normal text-[#2f2640] sm:text-[2rem]">
              Bem-vinda de volta
            </h1>
            <p className="mx-auto mt-3 max-w-[280px] text-sm leading-6 text-[#5e536e]">
              Acesse seu painel para gerenciar pedidos, estoque e produção artesanal.
            </p>
          </header>

          <form action={login} className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="email"
                className="block text-xs font-semibold uppercase tracking-normal text-[#544960]"
              >
                E-mail
              </label>
              <div className="login-input-shell">
                <Mail className="h-5 w-5 text-[#8b72b5]" aria-hidden />
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="h-12 min-w-0 flex-1 bg-transparent text-base text-[#2f2640] outline-none placeholder:text-[#9d91ad]"
                  placeholder="seu@email.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="password"
                className="block text-xs font-semibold uppercase tracking-normal text-[#544960]"
              >
                Senha
              </label>
              <div className="login-input-shell">
                <LockKeyhole className="h-5 w-5 text-[#8b72b5]" aria-hidden />
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="h-12 min-w-0 flex-1 bg-transparent text-base text-[#2f2640] outline-none placeholder:text-[#9d91ad]"
                  placeholder="Digite sua senha"
                />
              </div>
            </div>

            {error ? (
              <p
                id="login-error"
                className="rounded-lg border border-red-200 bg-red-50/85 px-3 py-2 text-sm leading-5 text-red-700"
              >
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-sm text-[#5f536f]">
              <label className="flex min-h-8 items-center gap-2">
                <input
                  type="checkbox"
                  name="remember"
                  className="h-4 w-4 rounded border-[#c9bedb] accent-[#8d62c9]"
                />
                <span>Lembrar-me</span>
              </label>
              <span className="font-medium text-[#6f48b6]">Esqueci a senha</span>
            </div>

            <button
              type="submit"
              className="group relative mt-1 flex h-12 min-h-12 w-full items-center justify-center overflow-hidden rounded-full bg-[linear-gradient(135deg,#bba8e3,#8d6dcc)] px-4 text-base font-semibold text-white shadow-[0_16px_34px_-18px_rgba(105,67,160,0.8)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_42px_-18px_rgba(105,67,160,0.85)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#c8bde9]/55 active:translate-y-0"
            >
              <span className="relative z-10">Entrar</span>
              <span
                aria-hidden
                className="login-button-shine absolute inset-y-0 left-0 w-1/2 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent"
              />
            </button>
          </form>

          <div className="my-6 flex items-center gap-3 text-sm text-[#746884]">
            <span className="h-px flex-1 bg-[#d8cfe8]" />
            <span>ou</span>
            <span className="h-px flex-1 bg-[#d8cfe8]" />
          </div>

          <p className="text-center text-sm leading-5 text-[#5f536f]">
            Ainda não tem conta?{' '}
            <span className="font-medium text-[#6f48b6]">Solicitar acesso</span>
          </p>
        </div>

        <p className="login-rise mt-6 text-center text-xs leading-5 text-[#7b6f8b] [animation-delay:240ms]">
          Feito com devoção • © 2026 {BRAND_NAME}
        </p>
      </section>
    </main>
  )
}

function SparkleMark({ className = '' }: { className?: string }) {
  return <Sparkles aria-hidden className={`login-sparkle absolute ${className}`} />
}
