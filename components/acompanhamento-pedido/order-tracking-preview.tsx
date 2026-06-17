import type { ComponentType, CSSProperties } from 'react'
import Image from 'next/image'
import {
  CalendarDays,
  Check,
  Gift,
  Hash,
  ListOrdered,
  Package,
  ShieldCheck,
  Sparkles,
  Wallet,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StatusPedido } from '@/lib/types/database'

export type TrackingStatus = StatusPedido

export type OrderTrackingData = {
  customerName: string
  orderCode: string
  status: TrackingStatus
  expectedDate: string
  product: string
  quantity: string
  totalValue: string
  customerNote?: string | null
  message: string
}

type TimelineStep = {
  status: Exclude<TrackingStatus, 'cancelado'>
  label: string
}

type StatusStyle = {
  label: string
  badge: string
  dot: string
  panel: string
  bead: string
  glow: string
}

const statusStyles: Record<TrackingStatus, StatusStyle> = {
  orcamento: {
    label: 'Orçamento',
    badge: 'border-[#E3DAF4] bg-white/78 text-[#5F5474]',
    dot: 'bg-[#C8BDE9]',
    panel: 'border-[#E3DAF4] bg-white/62',
    bead: 'bg-[#E3DAF4] text-[#333333]',
    glow: 'rgba(200,189,233,0.28)',
  },
  confirmado: {
    label: 'Confirmado',
    badge: 'border-[#D8CFED] bg-[#E3DAF4]/80 text-[#4F4261]',
    dot: 'bg-[#BDADE4]',
    panel: 'border-[#D8CFED] bg-[#F5F3FA]/88',
    bead: 'bg-[#C8BDE9] text-[#333333]',
    glow: 'rgba(200,189,233,0.38)',
  },
  separando_materiais: {
    label: 'Separando materiais',
    badge: 'border-[#D4C1F1] bg-[#E8DCF8]/88 text-[#5F3C8A]',
    dot: 'bg-[#A98BDC]',
    panel: 'border-[#D4C1F1] bg-[#F7F2FC]/88',
    bead: 'bg-[#BFA9EB] text-[#333333]',
    glow: 'rgba(169,139,220,0.36)',
  },
  em_producao: {
    label: 'Em produção',
    badge: 'border-[#D8CFED] bg-[#E3DAF4]/88 text-[#333333]',
    dot: 'bg-[#BBA8E4]',
    panel: 'border-[#D8CFED] bg-[#F5F3FA]/92',
    bead: 'bg-[#C8BDE9] text-white',
    glow: 'rgba(200,189,233,0.46)',
  },
  pronto: {
    label: 'Pronto para entrega',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    dot: 'bg-[#81C784]',
    panel: 'border-emerald-200 bg-emerald-50/70',
    bead: 'bg-[#A5D6A7] text-[#244728]',
    glow: 'rgba(129,199,132,0.42)',
  },
  entregue: {
    label: 'Entregue',
    badge: 'border-emerald-300 bg-emerald-100 text-emerald-900',
    dot: 'bg-emerald-600',
    panel: 'border-emerald-300 bg-emerald-50',
    bead: 'bg-[#81C784] text-white',
    glow: 'rgba(76,175,80,0.38)',
  },
  cancelado: {
    label: 'Cancelado',
    badge: 'border-red-200 bg-red-50 text-red-700',
    dot: 'bg-[#E57373]',
    panel: 'border-red-200 bg-red-50/72',
    bead: 'bg-[#E57373] text-white',
    glow: 'rgba(229,115,115,0.32)',
  },
}

const timelineSteps: TimelineStep[] = [
  { status: 'orcamento', label: 'Orçamento' },
  { status: 'confirmado', label: 'Confirmado' },
  { status: 'separando_materiais', label: 'Separando materiais' },
  { status: 'em_producao', label: 'Em produção' },
  { status: 'pronto', label: 'Pronto para entrega' },
  { status: 'entregue', label: 'Entregue' },
]

export function OrderTrackingPreview({ order }: { order: OrderTrackingData }) {
  const currentStyle = statusStyles[order.status] ?? statusStyles.orcamento
  const currentStepIndex =
    order.status === 'cancelado'
      ? -1
      : timelineSteps.findIndex((step) => step.status === order.status)
  const safeStepIndex = Math.max(currentStepIndex, 0)
  const progressRatio =
    currentStepIndex <= 0 ? 0 : safeStepIndex / (timelineSteps.length - 1)
  const progress = `${progressRatio * 100}%`
  const desktopProgress = `${progressRatio * (100 - 100 / timelineSteps.length)}%`
  const whatsappMessage = `Olá! Gostaria de falar sobre meu pedido ${order.orderCode}.`
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(whatsappMessage)}`

  return (
    <main className="tracking-shell relative isolate min-h-[100svh] overflow-hidden bg-[#FAFAFA] px-4 py-8 text-[#333333] sm:px-6 lg:px-8">
      <div aria-hidden className="tracking-aurora absolute inset-0 -z-20" />

      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <SparkleMark className="left-[11%] top-[13%] h-4 w-4 rotate-12 opacity-45" />
        <SparkleMark className="right-[13%] top-[18%] h-5 w-5 -rotate-6 opacity-40 [animation-delay:-2.4s]" />
        <SparkleMark className="left-[15%] bottom-[22%] h-4 w-4 rotate-45 opacity-35 [animation-delay:-4.1s]" />
        <SparkleMark className="right-[18%] bottom-[16%] h-6 w-6 rotate-12 opacity-35 [animation-delay:-5.6s]" />
      </div>

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-8 pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="tracking-rise mx-auto flex max-w-3xl flex-col items-center text-center">
          <div className="rounded-[1.75rem] border border-white/80 bg-white/58 px-8 py-5 shadow-[0_24px_62px_-38px_rgba(92,61,142,0.42)] backdrop-blur-xl">
            <Image
              src="/exclusiv-art-logo.png"
              alt="Exclusiv ART"
              width={184}
              height={184}
              priority
              className="h-24 w-auto object-contain opacity-90 drop-shadow-[0_18px_36px_rgba(92,61,142,0.22)] sm:h-28"
            />
          </div>

          <div className="mt-7 inline-flex min-h-10 items-center gap-2 rounded-full border border-[#E3DAF4] bg-white/78 px-5 text-sm font-semibold text-[#5F5474] shadow-[0_10px_32px_-24px_rgba(92,61,142,0.42)] backdrop-blur-xl">
            <Sparkles className="h-4 w-4 text-[#A792D8]" aria-hidden />
            Exclusiv ART
          </div>

          <h1 className="tracking-serif mt-8 max-w-2xl text-balance text-4xl font-medium leading-tight text-[#333333] sm:text-5xl lg:text-6xl">
            Acompanhamento do Pedido
          </h1>
          <p className="mt-5 max-w-2xl text-pretty text-lg leading-8 text-[#666666] sm:text-xl">
            Cada peça é preparada com cuidado, fé e atenção aos detalhes.
          </p>
        </header>

        <section className="tracking-card tracking-rise grid gap-6 p-6 [animation-delay:90ms] sm:p-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#666666]">
                  Olá,
                </p>
                <h2 className="tracking-serif mt-2 text-4xl font-medium leading-tight text-[#333333]">
                  {order.customerName}
                </h2>
                <p className="mt-2 text-base font-medium text-[#666666]">
                  Pedido{' '}
                  <span className="font-semibold tracking-wide text-[#333333]">
                    {order.orderCode}
                  </span>
                </p>
              </div>

              <div className={cn('inline-flex min-h-11 items-center gap-2 rounded-full border px-5 text-sm font-semibold shadow-[0_12px_28px_-22px_rgba(92,61,142,0.5)]', currentStyle.badge)}>
                <span className={cn('h-2.5 w-2.5 rounded-full', currentStyle.dot)} />
                {currentStyle.label}
              </div>
            </div>

            <div className="mt-8 flex min-h-16 flex-col gap-3 rounded-[1.75rem] bg-[#F5F3FA] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <span className="inline-flex items-center gap-3 text-[#666666]">
                <CalendarDays className="h-5 w-5 text-[#A792D8]" aria-hidden />
                Prazo previsto:
              </span>
              <strong className="text-lg font-semibold text-[#333333]">
                {order.expectedDate}
              </strong>
            </div>
          </div>

          <div className={cn('rounded-[1.75rem] border p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]', currentStyle.panel)}>
            <div className="flex items-start gap-4">
              <div
                className={cn('relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full shadow-[0_18px_36px_-18px_rgba(92,61,142,0.65)]', currentStyle.bead)}
                style={
                  {
                    '--tracking-status-glow': currentStyle.glow,
                  } as CSSProperties
                }
              >
                <span className="h-3 w-3 rounded-full bg-white" />
                <span className="absolute inset-[-8px] rounded-full border border-current/20" />
                {order.status !== 'cancelado' ? (
                  <SparkleMark className="-right-2 -top-2 h-3.5 w-3.5 opacity-65" />
                ) : null}
              </div>

              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#8F7DB9]">
                  Status atual
                </p>
                <p className="mt-2 text-2xl font-semibold text-[#333333]">
                  {currentStyle.label}
                </p>
                <p className="mt-2 text-sm leading-6 text-[#666666]">
                  {order.message}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="tracking-card tracking-rise p-6 [animation-delay:150ms] sm:p-8">
          <h2 className="tracking-serif text-2xl font-medium text-[#333333]">
            Linha do tempo do pedido
          </h2>

          <ol
            className="tracking-thread mt-8"
            style={
              {
                '--tracking-progress': progress,
                '--tracking-desktop-progress': desktopProgress,
              } as CSSProperties
            }
          >
            {timelineSteps.map((step, index) => {
              const isCompleted = currentStepIndex >= 0 && index < currentStepIndex
              const isCurrent = index === currentStepIndex
              const isFuture = !isCompleted && !isCurrent

              return (
                <li key={step.status} className="tracking-step">
                  <div
                    className={cn(
                      'tracking-bead',
                      isCompleted && 'tracking-bead-complete',
                      isCurrent && 'tracking-bead-current',
                      isFuture && 'tracking-bead-future',
                      isCurrent && statusStyles[step.status].bead,
                    )}
                    style={
                      isCurrent
                        ? ({
                            '--tracking-status-glow': statusStyles[step.status].glow,
                          } as CSSProperties)
                        : undefined
                    }
                    aria-current={isCurrent ? 'step' : undefined}
                  >
                    {isCompleted ? (
                      <Check className="h-5 w-5" aria-hidden />
                    ) : isCurrent ? (
                      <>
                        <span className="h-3 w-3 rounded-full bg-white" />
                        <SparkleMark className="-right-2 -top-2 h-3.5 w-3.5 opacity-70" />
                        <SparkleMark className="-bottom-1 -left-2 h-3 w-3 opacity-55 [animation-delay:-1.8s]" />
                      </>
                    ) : (
                      <span className="h-2.5 w-2.5 rounded-full bg-[#C8BDE9]/45" />
                    )}
                  </div>

                  <div className="min-w-0">
                    <p
                      className={cn(
                        'text-lg font-semibold leading-7',
                        isFuture ? 'text-[#8B8B8B]' : 'text-[#333333]',
                      )}
                    >
                      {step.label}
                    </p>
                    {isCurrent ? (
                      <p className="mt-1 text-sm font-medium text-[#666666]">
                        Etapa atual
                      </p>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ol>

          {order.status === 'cancelado' ? (
            <div className="mt-7 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
              Este pedido foi cancelado. Para qualquer dúvida, fale com a Exclusiv ART pelo WhatsApp.
            </div>
          ) : null}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="tracking-card tracking-rise p-6 [animation-delay:210ms] sm:p-8">
            <div className="mb-6 flex items-start gap-3">
              <Package className="mt-1 h-5 w-5 text-[#A792D8]" aria-hidden />
              <div>
                <h2 className="tracking-serif text-2xl font-medium text-[#333333]">
                  Resumo do pedido
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#666666]">
                  Confira os principais detalhes do seu pedido.
                </p>
              </div>
            </div>

            <dl className="divide-y divide-[#E3DAF4]/85">
              <SummaryRow icon={Gift} label="Produto" value={order.product} />
              <SummaryRow icon={ListOrdered} label="Quantidade" value={order.quantity} />
              <SummaryRow icon={Wallet} label="Valor total" value={order.totalValue} strong />
              <SummaryRow icon={CalendarDays} label="Prazo previsto" value={order.expectedDate} />
            </dl>

            {order.customerNote ? (
              <div className="mt-6 rounded-2xl border border-[#E3DAF4] bg-[#F5F3FA]/72 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8F7DB9]">
                  Observação para o cliente
                </p>
                <p className="mt-3 text-sm leading-6 text-[#333333]">
                  {order.customerNote}
                </p>
              </div>
            ) : null}
          </div>

          <div className="tracking-card tracking-rise flex flex-col justify-between gap-7 p-6 [animation-delay:270ms] sm:p-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#9A8AC2]">
                Mensagem da Exclusiv ART
              </p>
              <p className="mt-6 text-lg leading-8 text-[#333333]">
                {order.message}
              </p>
            </div>

            <div className="rounded-2xl bg-[#F5F3FA]/85 px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-medium text-[#666666]">
                <ShieldCheck className="h-4 w-4 text-[#81C784]" aria-hidden />
                Este acompanhamento mostra apenas informações públicas do seu pedido.
              </p>
            </div>
          </div>
        </section>

        <section className="tracking-rise sticky bottom-[max(1rem,env(safe-area-inset-bottom))] z-20 flex flex-col items-center gap-4 pt-2 [animation-delay:330ms] lg:static">
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="tracking-whatsapp-link group relative flex min-h-14 w-full max-w-3xl items-center justify-center overflow-hidden rounded-full bg-[#C8BDE9] px-6 text-center text-base font-semibold text-[#333333] shadow-[0_18px_42px_-24px_rgba(92,61,142,0.68)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#BFB1E4] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#C8BDE9]/55 active:translate-y-0"
          >
            <span className="relative z-10 flex items-center justify-center gap-3">
              <WhatsAppIcon className="h-5 w-5" />
              Falar com a Exclusiv ART pelo WhatsApp
            </span>
            <span
              aria-hidden
              className="tracking-whatsapp-shine absolute inset-y-0 left-0 w-1/2 -translate-x-full bg-gradient-to-r from-transparent via-white/35 to-transparent"
            />
          </a>

          <p className="flex items-center justify-center gap-2 text-center text-sm font-medium text-[#666666]">
            <ShieldCheck className="h-4 w-4 text-[#81C784]" aria-hidden />
            Atendimento direto com a artesã
          </p>
        </section>

        <footer className="pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-8 text-center">
          <p className="tracking-serif text-lg text-[#333333]">
            Exclusiv ART — Feito com cuidado e carinho.
          </p>
          <p className="mt-3 text-sm leading-6 text-[#666666]">
            Este link mostra apenas as informações públicas do seu pedido.
          </p>
        </footer>
      </div>
    </main>
  )
}

export function OrderTrackingUnavailable() {
  return (
    <main className="tracking-shell relative isolate flex min-h-[100svh] items-center justify-center overflow-hidden px-4 py-8 text-[#333333]">
      <div aria-hidden className="tracking-aurora absolute inset-0 -z-20" />
      <section className="tracking-card mx-auto max-w-md p-8 text-center">
        <Image
          src="/exclusiv-art-logo.png"
          alt="Exclusiv ART"
          width={144}
          height={144}
          className="mx-auto h-24 w-auto object-contain opacity-90"
        />
        <h1 className="tracking-serif mt-8 text-3xl font-medium">
          Link indisponível
        </h1>
        <p className="mt-4 text-sm leading-6 text-[#666666]">
          Não encontramos um acompanhamento ativo para este link. Peça um novo link para a Exclusiv ART.
        </p>
      </section>
    </main>
  )
}

function SummaryRow({
  icon: Icon,
  label,
  value,
  strong = false,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 py-5 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F5F3FA] text-[#A792D8]">
        <Icon className="h-4 w-4" />
      </div>
      <dt className="text-[#666666]">{label}</dt>
      <dd
        className={cn(
          'col-span-2 text-left font-semibold text-[#333333] sm:col-span-1 sm:text-right',
          strong && 'text-xl',
        )}
      >
        {value}
      </dd>
    </div>
  )
}

function SparkleMark({ className = '' }: { className?: string }) {
  return (
    <Sparkles
      aria-hidden
      className={cn('tracking-sparkle absolute text-[#A792D8]', className)}
    />
  )
}

function WhatsAppIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d="M20.52 3.48A11.86 11.86 0 0 0 12.08 0C5.52 0 .19 5.33.19 11.89c0 2.1.55 4.15 1.6 5.95L0 24l6.32-1.66a11.88 11.88 0 0 0 5.76 1.47h.01c6.56 0 11.89-5.33 11.89-11.89 0-3.18-1.24-6.17-3.46-8.44Zm-8.43 18.32h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.22-3.75.98 1-3.65-.24-.38a9.86 9.86 0 0 1-1.51-5.26C2.19 6.43 6.63 2 12.09 2a9.82 9.82 0 0 1 6.99 2.9 9.82 9.82 0 0 1 2.9 7.01c0 5.45-4.44 9.89-9.89 9.89Zm5.42-7.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.08-.3-.15-1.25-.46-2.38-1.47a8.9 8.9 0 0 1-1.65-2.05c-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.05 1.03-1.05 2.5 0 1.47 1.08 2.9 1.23 3.1.15.2 2.12 3.23 5.13 4.53.72.31 1.28.5 1.72.64.72.23 1.38.2 1.9.12.58-.09 1.76-.72 2.01-1.42.25-.7.25-1.29.17-1.42-.07-.13-.27-.2-.57-.35Z" />
    </svg>
  )
}
