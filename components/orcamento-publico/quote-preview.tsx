import type { ComponentType } from 'react'
import Image from 'next/image'
import {
  CalendarDays,
  Clock3,
  FileText,
  Gift,
  Hash,
  Layers3,
  ListOrdered,
  ShieldCheck,
  Sparkles,
  Wallet,
} from 'lucide-react'
import type {
  OrcamentoComItens,
  OrigemComponenteOrcamento,
  StatusOrcamento,
} from '@/lib/types/database'
import { cn } from '@/lib/utils'

export type QuotePreviewData = {
  cliente_nome: string
  orcamento_codigo: string
  status: StatusOrcamento | 'previa'
  validade: string | null
  prazo_estimado: string | null
  quantidade_total: number
  valor_total: number
  observacao_cliente: string | null
  created_at?: string | null
  itens: Array<{
    nome_produto: string
    quantidade: number
    valor_total: number
    componentes: Array<{
      grupo_nome: string
      material_nome: string
      quantidade_por_item: number
      unidade: string
      cor_hex: string | null
      origem: OrigemComponenteOrcamento
    }>
  }>
}

const statusStyles: Record<
  QuotePreviewData['status'],
  { label: string; badge: string; dot: string; panel: string }
> = {
  previa: {
    label: 'Pré-visualização',
    badge: 'border-[#E3DAF4] bg-white/80 text-[#5F5474]',
    dot: 'bg-[#A792D8]',
    panel: 'border-[#E3DAF4] bg-white/64',
  },
  rascunho: {
    label: 'Em preparação',
    badge: 'border-[#E3DAF4] bg-white/80 text-[#5F5474]',
    dot: 'bg-[#C8BDE9]',
    panel: 'border-[#E3DAF4] bg-white/64',
  },
  enviado: {
    label: 'Enviado',
    badge: 'border-[#D8CFED] bg-[#E3DAF4]/85 text-[#4F4261]',
    dot: 'bg-[#A792D8]',
    panel: 'border-[#D8CFED] bg-[#F5F3FA]/90',
  },
  aprovado: {
    label: 'Aprovado',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    dot: 'bg-emerald-500',
    panel: 'border-emerald-200 bg-emerald-50/72',
  },
  recusado: {
    label: 'Recusado',
    badge: 'border-rose-200 bg-rose-50 text-rose-700',
    dot: 'bg-rose-500',
    panel: 'border-rose-200 bg-rose-50/72',
  },
  convertido: {
    label: 'Pedido confirmado',
    badge: 'border-violet-200 bg-violet-50 text-violet-800',
    dot: 'bg-violet-500',
    panel: 'border-violet-200 bg-violet-50/72',
  },
  cancelado: {
    label: 'Cancelado',
    badge: 'border-red-200 bg-red-50 text-red-700',
    dot: 'bg-red-500',
    panel: 'border-red-200 bg-red-50/72',
  },
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value || 0))
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'A combinar'
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return 'A combinar'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, day))
}

export function mapOrcamentoToPreview(orcamento: OrcamentoComItens): QuotePreviewData {
  return {
    cliente_nome: orcamento.cliente_nome,
    orcamento_codigo: `EXO-${orcamento.id.slice(0, 8).toUpperCase()}`,
    status: orcamento.status,
    validade: orcamento.validade,
    prazo_estimado: orcamento.prazo_estimado,
    quantidade_total: Number(orcamento.quantidade_total || 0),
    valor_total: Number(orcamento.valor_total || 0),
    observacao_cliente: orcamento.observacao_cliente,
    created_at: orcamento.created_at,
    itens: [...(orcamento.orcamento_itens || [])]
      .sort((left, right) => left.ordem - right.ordem)
      .map((item) => ({
        nome_produto: item.nome_produto,
        quantidade: Number(item.quantidade || 0),
        valor_total: Number(item.valor_total || 0),
        componentes: [...(item.orcamento_componentes || [])]
          .sort((left, right) => left.ordem - right.ordem)
          .map((componente) => ({
            grupo_nome: componente.grupo_nome,
            material_nome: componente.material_nome,
            quantidade_por_item: Number(componente.quantidade_por_item || 0),
            unidade: componente.unidade,
            cor_hex: componente.cor_hex,
            origem: componente.origem,
          })),
      })),
  }
}

export function QuotePreview({
  quote,
  standalone = false,
  className,
}: {
  quote: QuotePreviewData
  standalone?: boolean
  className?: string
}) {
  const status = statusStyles[quote.status] ?? statusStyles.rascunho
  const products = quote.itens.map((item) => item.nome_produto).filter(Boolean)
  const productSummary =
    products.length <= 2 ? products.join(', ') : `${products.slice(0, 2).join(', ')} +${products.length - 2}`
  const whatsappMessage = `Olá! Vi meu orçamento ${quote.orcamento_codigo} e gostaria de confirmar os detalhes.`
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(whatsappMessage)}`

  return (
    <main
      className={cn(
        'tracking-shell relative isolate overflow-hidden bg-[#FAFAFA] text-[#333333]',
        standalone ? 'min-h-[100svh] px-4 py-8 sm:px-6 lg:px-8' : 'rounded-[1.75rem] p-3 sm:p-5',
        className
      )}
    >
      <div aria-hidden className="tracking-aurora absolute inset-0 -z-20" />
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <SparkleMark className="left-[8%] top-[9%] h-4 w-4 rotate-12 opacity-45" />
        <SparkleMark className="right-[10%] top-[17%] h-5 w-5 -rotate-6 opacity-40 [animation-delay:-2.4s]" />
        <SparkleMark className="bottom-[19%] left-[12%] h-4 w-4 rotate-45 opacity-35 [animation-delay:-4.1s]" />
        <SparkleMark className="bottom-[13%] right-[14%] h-6 w-6 rotate-12 opacity-35 [animation-delay:-5.6s]" />
      </div>

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 pb-6 pt-[max(0.5rem,env(safe-area-inset-top))] sm:gap-6">
        <header className="tracking-rise mx-auto flex max-w-3xl flex-col items-center text-center">
          <div className="rounded-[1.75rem] border border-white/80 bg-white/58 px-7 py-4 shadow-[0_24px_62px_-38px_rgba(92,61,142,0.42)] backdrop-blur-xl">
            <Image
              src="/exclusiv-art-logo.png"
              alt="Exclusiv ART"
              width={184}
              height={184}
              priority
              className="h-20 w-auto object-contain opacity-90 drop-shadow-[0_18px_36px_rgba(92,61,142,0.22)] sm:h-24"
            />
          </div>
          <div className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-full border border-[#E3DAF4] bg-white/78 px-5 text-sm font-semibold text-[#5F5474] shadow-[0_10px_32px_-24px_rgba(92,61,142,0.42)] backdrop-blur-xl">
            <Sparkles className="h-4 w-4 text-[#A792D8]" aria-hidden />
            Exclusiv ART
          </div>
          <h1 className="tracking-serif mt-6 max-w-2xl text-balance text-4xl font-medium leading-tight text-[#333333] sm:text-5xl lg:text-6xl">
            Seu orçamento personalizado
          </h1>
          <p className="mt-4 max-w-2xl text-pretty text-base leading-7 text-[#666666] sm:text-lg">
            Cada detalhe foi pensado para transformar sua ideia em uma peça única.
          </p>
        </header>

        <section className="tracking-card tracking-rise grid gap-6 p-5 [animation-delay:90ms] sm:p-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#666666]">
                  Olá,
                </p>
                <h2 className="tracking-serif mt-2 text-4xl font-medium leading-tight text-[#333333]">
                  {quote.cliente_nome || 'cliente'}
                </h2>
                <p className="mt-2 inline-flex items-center gap-2 text-base font-medium text-[#666666]">
                  <Hash className="h-4 w-4 text-[#A792D8]" aria-hidden />
                  <span className="font-semibold tracking-wide text-[#333333]">
                    {quote.orcamento_codigo}
                  </span>
                </p>
              </div>
              <div
                className={cn(
                  'inline-flex min-h-11 items-center gap-2 rounded-full border px-5 text-sm font-semibold shadow-[0_12px_28px_-22px_rgba(92,61,142,0.5)]',
                  status.badge
                )}
              >
                <span className={cn('h-2.5 w-2.5 rounded-full', status.dot)} />
                {status.label}
              </div>
            </div>

            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              <DatePanel icon={CalendarDays} label="Validade" value={formatDate(quote.validade)} />
              <DatePanel
                icon={Clock3}
                label="Prazo estimado"
                value={formatDate(quote.prazo_estimado)}
              />
            </div>
          </div>

          <div
            className={cn(
              'rounded-[1.75rem] border p-6 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]',
              status.panel
            )}
          >
            <Wallet className="mx-auto h-6 w-6 text-[#A792D8]" aria-hidden />
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.22em] text-[#8F7DB9]">
              Valor total
            </p>
            <p className="tracking-serif mt-3 text-4xl font-semibold text-[#333333] sm:text-5xl">
              {formatCurrency(quote.valor_total)}
            </p>
            <p className="mt-3 text-sm text-[#666666]">
              {quote.quantidade_total} {quote.quantidade_total === 1 ? 'unidade' : 'unidades'}
            </p>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="tracking-card tracking-rise p-5 [animation-delay:150ms] sm:p-8">
            <div className="mb-5 flex items-start gap-3">
              <Gift className="mt-1 h-5 w-5 text-[#A792D8]" aria-hidden />
              <div>
                <h2 className="tracking-serif text-2xl font-medium text-[#333333]">
                  Resumo do orçamento
                </h2>
                <p className="mt-1 text-sm leading-6 text-[#666666]">
                  Confira os produtos e quantidades desta proposta.
                </p>
              </div>
            </div>
            <dl className="divide-y divide-[#E3DAF4]/85">
              <SummaryRow icon={Gift} label="Produto" value={productSummary || 'Produto personalizado'} />
              <SummaryRow
                icon={ListOrdered}
                label="Quantidade"
                value={`${quote.quantidade_total} ${
                  quote.quantidade_total === 1 ? 'unidade' : 'unidades'
                }`}
              />
              <SummaryRow icon={Wallet} label="Valor total" value={formatCurrency(quote.valor_total)} strong />
              <SummaryRow icon={CalendarDays} label="Validade" value={formatDate(quote.validade)} />
            </dl>
          </div>

          <div className="tracking-card tracking-rise p-5 [animation-delay:210ms] sm:p-8">
            <div className="mb-5 flex items-start gap-3">
              <Layers3 className="mt-1 h-5 w-5 text-[#A792D8]" aria-hidden />
              <div>
                <h2 className="tracking-serif text-2xl font-medium text-[#333333]">
                  Componentes principais
                </h2>
                <p className="mt-1 text-sm leading-6 text-[#666666]">
                  Materiais escolhidos para compor suas peças.
                </p>
              </div>
            </div>
            <div className="space-y-3">
              {quote.itens.flatMap((item, itemIndex) =>
                item.componentes.map((component, componentIndex) => (
                  <div
                    key={`${itemIndex}-${componentIndex}-${component.material_nome}`}
                    className="rounded-2xl border border-[#E3DAF4] bg-white/70 p-4 backdrop-blur-lg"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-[#333333]">
                          {component.material_nome}
                        </p>
                        <p className="mt-1 text-xs text-[#666666]">
                          {component.grupo_nome} · {Number(component.quantidade_por_item)}{' '}
                          {component.unidade}/item
                        </p>
                      </div>
                      <OriginBadge origin={component.origem} />
                    </div>
                  </div>
                ))
              )}
              {quote.itens.every((item) => item.componentes.length === 0) && (
                <p className="rounded-2xl bg-[#F5F3FA]/80 px-4 py-5 text-center text-sm text-[#666666]">
                  Os componentes serão definidos com você.
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="tracking-card tracking-rise p-5 [animation-delay:270ms] sm:p-8">
          <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              {quote.observacao_cliente && (
                <div className="mb-5 rounded-2xl border border-[#E3DAF4] bg-[#F5F3FA]/72 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8F7DB9]">
                    Observação para você
                  </p>
                  <p className="mt-3 text-sm leading-6 text-[#333333]">
                    {quote.observacao_cliente}
                  </p>
                </div>
              )}
              <p className="flex items-start gap-3 text-sm leading-6 text-[#666666]">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#A792D8]" aria-hidden />
                <span>
                  Este orçamento não reserva materiais automaticamente. A produção começa após
                  confirmação.
                </span>
              </p>
            </div>
          </div>
        </section>

        <section
          className={cn(
            'tracking-rise z-20 flex flex-col items-center gap-4 pt-1 [animation-delay:330ms]',
            standalone
              ? 'sticky bottom-[max(1rem,env(safe-area-inset-bottom))] sm:static'
              : 'static'
          )}
        >
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="tracking-whatsapp-link group relative flex min-h-14 w-full max-w-3xl cursor-pointer items-center justify-center overflow-hidden rounded-full bg-[#C8BDE9] px-6 text-center text-base font-semibold text-[#333333] shadow-[0_18px_42px_-24px_rgba(92,61,142,0.68)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#BFB1E4] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#C8BDE9]/55 active:translate-y-0 motion-reduce:transition-none"
          >
            <span className="relative z-10 flex items-center justify-center gap-3">
              <WhatsAppIcon className="h-5 w-5" />
              Falar sobre este orçamento no WhatsApp
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

        <footer className="pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5 text-center">
          <p className="tracking-serif text-lg text-[#333333]">
            Exclusiv ART — Feito com cuidado e carinho.
          </p>
          {quote.created_at && (
            <p className="mt-2 text-sm text-[#666666]">
              Orçamento preparado em {formatDate(quote.created_at)}
            </p>
          )}
        </footer>
      </div>
    </main>
  )
}

export function QuoteUnavailable() {
  return (
    <main className="tracking-shell relative isolate flex min-h-[100svh] items-center justify-center overflow-hidden bg-[#FAFAFA] px-4 py-8 text-[#333333]">
      <div aria-hidden className="tracking-aurora absolute inset-0 -z-20" />
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <SparkleMark className="left-[12%] top-[17%] h-5 w-5 opacity-45" />
        <SparkleMark className="bottom-[18%] right-[14%] h-6 w-6 opacity-35 [animation-delay:-2.8s]" />
      </div>
      <section className="tracking-card mx-auto max-w-md p-8 text-center" role="alert">
        <Image
          src="/exclusiv-art-logo.png"
          alt="Exclusiv ART"
          width={144}
          height={144}
          className="mx-auto h-24 w-auto object-contain opacity-90"
        />
        <h1 className="tracking-serif mt-8 text-3xl font-medium">Link indisponível</h1>
        <p className="mt-4 text-sm leading-6 text-[#666666]">
          Não encontramos um orçamento ativo para este link. Peça um novo link para a Exclusiv ART.
        </p>
      </section>
    </main>
  )
}

function DatePanel({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="rounded-[1.25rem] bg-[#F5F3FA] px-4 py-3">
      <span className="flex items-center gap-2 text-xs font-medium text-[#666666]">
        <Icon className="h-4 w-4 text-[#A792D8]" aria-hidden />
        {label}
      </span>
      <strong className="mt-1 block text-sm text-[#333333]">{value}</strong>
    </div>
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
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F5F3FA] text-[#A792D8]">
        <Icon className="h-4 w-4" />
      </div>
      <dt className="text-[#666666]">{label}</dt>
      <dd
        className={cn(
          'col-span-2 text-left font-semibold text-[#333333] sm:col-span-1 sm:text-right',
          strong && 'text-xl'
        )}
      >
        {value}
      </dd>
    </div>
  )
}

function OriginBadge({ origin }: { origin: OrigemComponenteOrcamento }) {
  return origin === 'estoque' ? (
    <span className="rounded-full border border-[#D8CFED] bg-[#E3DAF4]/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#4F4261]">
      Do estoque
    </span>
  ) : (
    <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
      Sob encomenda
    </span>
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
    <svg aria-hidden viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M20.52 3.48A11.86 11.86 0 0 0 12.08 0C5.52 0 .19 5.33.19 11.89c0 2.1.55 4.15 1.6 5.95L0 24l6.32-1.66a11.88 11.88 0 0 0 5.76 1.47h.01c6.56 0 11.89-5.33 11.89-11.89 0-3.18-1.24-6.17-3.46-8.44Zm-8.43 18.32h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.22-3.75.98 1-3.65-.24-.38a9.86 9.86 0 0 1-1.51-5.26C2.19 6.43 6.63 2 12.09 2a9.82 9.82 0 0 1 6.99 2.9 9.82 9.82 0 0 1 2.9 7.01c0 5.45-4.44 9.89-9.89 9.89Zm5.42-7.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.08-.3-.15-1.25-.46-2.38-1.47a8.9 8.9 0 0 1-1.65-2.05c-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.05 1.03-1.05 2.5 0 1.47 1.08 2.9 1.23 3.1.15.2 2.12 3.23 5.13 4.53.72.31 1.28.5 1.72.64.72.23 1.38.2 1.9.12.58-.09 1.76-.72 2.01-1.42.25-.7.25-1.29.17-1.42-.07-.13-.27-.2-.57-.35Z" />
    </svg>
  )
}
