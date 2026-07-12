'use client'

import Link from 'next/link'
import type { ComponentType, ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { formatBusinessMonth } from '@/lib/business-time'
import { formatDateBR, parseDateString } from '@/lib/utils'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  CalendarDays,
  CheckCircle2,
  Clock,
  History,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Wallet,
} from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { Material, Pedido } from '@/lib/types/database'
import { STATUS_PEDIDO_OPTIONS } from '@/lib/types/database'

function RelativeTime({ date }: { date: string }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <span className="text-xs text-muted-foreground">...</span>
  }

  const parsedDate = parseDateString(date) || new Date(date)
  if (Number.isNaN(parsedDate.getTime())) {
    return <span className="text-xs text-muted-foreground">data indisponível</span>
  }

  return (
    <span className="text-xs text-muted-foreground">
      {formatDistanceToNow(parsedDate, {
        addSuffix: true,
        locale: ptBR,
      })}
    </span>
  )
}

type PedidoStatusResumo = {
  status: string
  label: string
  className: string
  total: number
}

type FinanceiroDia = {
  dia: string
  receita: number
  despesas: number
}

type DashboardMetrics = {
  totalPedidosMes: number
  receitaMes: number
  receitaPedidosSistema: number
  receitaHistorica: number
  totalVendidoDesdeInicio: number
  pedidosPendentes: number
  materiaisSemEstoque: number
  materiaisBaixoEstoque: number
  despesasTotalMes: number
  lucroMes: number
  pedidosPorStatus: PedidoStatusResumo[]
  financeiroUltimosDias: FinanceiroDia[]
  pedidosRecentes: Pedido[]
  proximosEntregas: Pedido[]
  materiaisLowStock: Material[]
}

const STATUS_LABELS: Record<string, string> = {
  orcamento: 'Orçamento',
  separando_material: 'Separando material',
  em_producao: 'Em produção',
  pronto: 'Pronto',
  pago: 'Pago',
  pago_entregue: 'Pago entregue',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
}

function formatCurrency(value: unknown) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(asNumber(value))
}

function getStatusColor(status: string) {
  return (
    STATUS_PEDIDO_OPTIONS.find((s) => s.value === status)?.className ??
    'bg-gray-100 text-gray-800'
  )
}

function getStatusLabel(status: string) {
  return STATUS_LABELS[status] ?? status
}

function getEstoqueAtual(material: Material) {
  return asNumber(material.quantidade_atual ?? material.quantidade)
}

function asNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatShortDate(value: string | null) {
  return formatDateBR(value, 'dd/MM')
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-28 items-center justify-center rounded-2xl border border-dashed border-[#eadff4] bg-[#fbf8ff] px-4 py-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}

function MetricCard({
  title,
  value,
  description,
  icon: Icon,
  tone,
}: {
  title: string
  value: string | number
  description: string
  icon: ComponentType<{ className?: string }>
  tone: 'neutral' | 'green' | 'amber' | 'rose'
}) {
  const toneClasses = {
    neutral: {
      bubble: 'bg-violet-100 text-violet-600',
      value: 'text-[#15142a]',
    },
    green: {
      bubble: 'bg-emerald-100 text-emerald-600',
      value: 'text-emerald-600',
    },
    amber: {
      bubble: 'bg-amber-100 text-amber-600',
      value: 'text-amber-600',
    },
    rose: {
      bubble: 'bg-rose-100 text-rose-600',
      value: 'text-rose-600',
    },
  }[tone]

  return (
    <Card className="rounded-[22px] border-[#eadff4] bg-white shadow-[0_16px_45px_rgba(83,48,122,0.06)]">
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
        <CardTitle className="text-sm font-semibold text-[#706b82]">{title}</CardTitle>
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-full', toneClasses.bubble)}>
          <Icon className="h-5 w-5" />
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        <div className={cn('text-3xl font-semibold tracking-tight', toneClasses.value)}>
          {value}
        </div>
        <p className="text-xs text-[#706b82]">{description}</p>
      </CardContent>
    </Card>
  )
}

function FinancialCard({
  title,
  value,
  description,
  icon: Icon,
  tone,
}: {
  title: string
  value: number
  description: string
  icon: ComponentType<{ className?: string }>
  tone: 'green' | 'rose' | 'blue'
}) {
  const toneClasses = {
    green: 'border-emerald-100 bg-gradient-to-br from-emerald-50 to-emerald-100/60 text-emerald-600',
    rose: 'border-rose-100 bg-gradient-to-br from-rose-50 to-rose-100/60 text-rose-600',
    blue: 'border-sky-100 bg-gradient-to-br from-sky-50 to-blue-100/60 text-sky-600',
  }[tone]

  return (
    <Card className={cn('rounded-[22px] shadow-[0_16px_45px_rgba(83,48,122,0.06)]', toneClasses)}>
      <CardContent className="space-y-4 p-6">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#706b82]">
          <Icon className="h-4 w-4" />
          {title}
        </div>
        <div>
          <div className="text-3xl font-semibold tracking-tight">{formatCurrency(value)}</div>
          <p className="mt-1 text-xs text-[#706b82]">{description}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function buildPath(points: { x: number; y: number }[]) {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ')
}

function TrendChart({ data }: { data?: FinanceiroDia[] }) {
  const chartData =
    data && data.length > 0
      ? data
      : [
          { dia: 'Seg', receita: 0, despesas: 0 },
          { dia: 'Ter', receita: 0, despesas: 0 },
          { dia: 'Qua', receita: 0, despesas: 0 },
          { dia: 'Qui', receita: 0, despesas: 0 },
          { dia: 'Sex', receita: 0, despesas: 0 },
          { dia: 'Sáb', receita: 0, despesas: 0 },
          { dia: 'Dom', receita: 0, despesas: 0 },
        ]
  const width = 760
  const height = 220
  const top = 24
  const bottom = 52
  const left = 14
  const right = 14
  const baseY = height - bottom
  const maxValue = Math.max(
    ...chartData.flatMap((item) => [asNumber(item.receita), asNumber(item.despesas)]),
    1
  )
  const step = (width - left - right) / Math.max(chartData.length - 1, 1)

  const getPoints = (key: 'receita' | 'despesas') =>
    chartData.map((item, index) => ({
      x: left + step * index,
      y: baseY - (asNumber(item[key]) / maxValue) * (baseY - top),
    }))

  const receitaPoints = getPoints('receita')
  const despesaPoints = getPoints('despesas')
  const receitaPath = buildPath(receitaPoints)
  const despesaPath = buildPath(despesaPoints)
  const areaPath = `${receitaPath} L ${receitaPoints[receitaPoints.length - 1]?.x ?? right} ${baseY} L ${receitaPoints[0]?.x ?? left} ${baseY} Z`

  return (
    <div className="h-64 w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" preserveAspectRatio="none" role="img" aria-label="Gráfico de receita e despesas dos últimos 7 dias">
        <defs>
          <linearGradient id="receitaArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
        </defs>

        <path d={areaPath} fill="url(#receitaArea)" />
        <path d={receitaPath} fill="none" stroke="#0ea566" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
        <path d={despesaPath} fill="none" stroke="#ef4444" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" />

        {chartData.map((item, index) => (
          <text
            key={`${item.dia}-${index}`}
            x={left + step * index}
            y={height - 16}
            fill="#706b82"
            fontSize="11"
            textAnchor="middle"
          >
            {item.dia}
          </text>
        ))}
      </svg>
    </div>
  )
}

function StatusSummaryCard({ statusList }: { statusList: PedidoStatusResumo[] }) {
  const getTotal = (...statuses: string[]) =>
    statusList
      .filter((item) => statuses.includes(item.status))
      .reduce((acc, item) => acc + item.total, 0)

  const groups = [
    { label: 'Entregue', total: getTotal('pago_entregue', 'entregue'), color: 'bg-emerald-500' },
    { label: 'Pago', total: getTotal('pago'), color: 'bg-teal-500' },
    { label: 'Produção', total: getTotal('separando_material', 'em_producao', 'pronto'), color: 'bg-sky-500' },
    { label: 'Orçamento', total: getTotal('orcamento'), color: 'bg-amber-500' },
    { label: 'Cancelado', total: getTotal('cancelado'), color: 'bg-rose-500' },
  ].filter((group) => group.total > 0)

  const total = groups.reduce((acc, group) => acc + group.total, 0)

  return (
    <Card className="rounded-[22px] border-[#eadff4] bg-white shadow-[0_16px_45px_rgba(83,48,122,0.06)]">
      <CardHeader>
        <CardTitle>Pedidos por Status</CardTitle>
        <CardDescription>Distribuição do mês</CardDescription>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <EmptyState>Nenhum pedido registrado neste mês.</EmptyState>
        ) : (
          <div className="space-y-5">
            <div className="flex h-3 overflow-hidden rounded-full bg-[#f3edf8]">
              {groups.map((group) => (
                <div
                  key={group.label}
                  className={group.color}
                  style={{ width: `${Math.max((group.total / total) * 100, 8)}%` }}
                />
              ))}
            </div>

            <div className="space-y-3">
              {groups.map((group) => (
                <div key={group.label} className="flex items-center justify-between gap-3 text-sm">
                  <div className="flex items-center gap-3 text-[#706b82]">
                    <span className={cn('h-3 w-3 rounded-full', group.color)} />
                    {group.label}
                  </div>
                  <span className="font-semibold text-[#15142a]">{group.total}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function LifetimeSalesCard({
  title,
  value,
  description,
  icon: Icon,
  emphasis = false,
}: {
  title: string
  value: number
  description: string
  icon: ComponentType<{ className?: string }>
  emphasis?: boolean
}) {
  return (
    <Card
      className={cn(
        'rounded-[22px] border-[#eadff4] bg-white shadow-[0_16px_45px_rgba(83,48,122,0.06)]',
        emphasis && 'bg-gradient-to-br from-[#f5f0ff] to-white'
      )}
    >
      <CardContent className="flex items-center justify-between gap-4 p-6">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#706b82]">{title}</p>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-[#15142a]">
            {formatCurrency(value)}
          </p>
          <p className="mt-1 text-xs leading-5 text-[#706b82]">{description}</p>
        </div>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#e3daf4] text-[#6f56a4]">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  )
}

function buildResumoMensagem(metrics: DashboardMetrics) {
  if (metrics.materiaisSemEstoque > 0) {
    return `${metrics.materiaisSemEstoque} material(is) estao sem estoque. Reponha esses itens antes de confirmar novos pedidos que dependam deles.`
  }

  if (metrics.materiaisBaixoEstoque > 0) {
    return `${metrics.materiaisBaixoEstoque} material(is) precisam de reposicao. Ajuste o estoque antes de confirmar novos pedidos grandes.`
  }

  if (metrics.proximosEntregas.length >= 3) {
    return `Semana com alta demanda: ${metrics.proximosEntregas.length} entregas previstas nos proximos 7 dias. Priorize producao e conferencias.`
  }

  if (metrics.proximosEntregas.length > 0) {
    return `${metrics.proximosEntregas.length} entrega(s) previstas nos proximos 7 dias. Acompanhe os prazos de producao.`
  }

  if (metrics.pedidosPendentes > 0) {
    return `Voce tem ${metrics.pedidosPendentes} pedido(s) em andamento. Bom momento para revisar status e etapas de producao.`
  }

  if (metrics.lucroMes < 0) {
    return `Atencao: as despesas estao maiores que a receita neste mes. Revise custos, compras e precos dos produtos.`
  }

  if (metrics.totalPedidosMes === 0) {
    return 'Nenhum pedido registrado neste mes. Bom momento para revisar produtos, fotos e materiais do estoque.'
  }

  if (metrics.receitaMes > 0) {
    return `Receita do mes em ${formatCurrency(metrics.receitaMes)}. O estoque esta saudavel e nao ha entregas urgentes nos proximos 7 dias.`
  }

  return 'Seu estoque esta saudavel e nao ha entregas urgentes nos proximos 7 dias. Bom momento para focar em novos produtos.'
}

export function DashboardContent({
  metrics,
  usuarioNome,
  mostrarBoasVindas,
}: {
  metrics: DashboardMetrics
  usuarioNome: string
  mostrarBoasVindas: boolean
}) {
  const currentMonth = formatBusinessMonth()
  const resumoMensagem = buildResumoMensagem(metrics)

  useEffect(() => {
    if (!mostrarBoasVindas) {
      return
    }

    toast.success(`Ola, ${usuarioNome}! Que bom te ver de volta.`)

    const url = new URL(window.location.href)
    url.searchParams.delete('welcome')
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  }, [mostrarBoasVindas, usuarioNome])

  return (
    <div className="flex w-full flex-col gap-6">
      <section>
        <h1 className="text-3xl font-semibold tracking-tight text-[#15142a]">Página inicial</h1>
        <p className="mt-2 text-sm text-[#706b82]">
          Visão geral do seu negócio em {currentMonth}.
        </p>
      </section>

      {metrics.materiaisLowStock.length > 0 && (
        <Alert className="rounded-[18px] border-rose-200 bg-rose-50 text-rose-900">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Atenção: estoque baixo</AlertTitle>
          <AlertDescription>
            {metrics.materiaisLowStock.length} material(is) precisam de reposição:{' '}
            <span className="font-medium">
              {metrics.materiaisLowStock.slice(0, 3).map((material) => material.nome).join(', ')}
              {metrics.materiaisLowStock.length > 3 &&
                ` e mais ${metrics.materiaisLowStock.length - 3}`}
            </span>
          </AlertDescription>
        </Alert>
      )}

      <section className="rounded-[22px] bg-gradient-to-r from-[#9c6ed0] to-[#cf9bea] p-6 text-white shadow-[0_18px_45px_rgba(132,80,178,0.22)]">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/20">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-white/80">Resumo inteligente</p>
            <p className="mt-2 text-sm font-medium leading-6 text-white">{resumoMensagem}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Pedidos do Mês"
          value={metrics.totalPedidosMes}
          description="+0 vs. mês anterior"
          icon={ShoppingCart}
          tone="neutral"
        />
        <MetricCard
          title="Receita do Mês"
          value={formatCurrency(metrics.receitaMes)}
          description="em vendas"
          icon={TrendingUp}
          tone="green"
        />
        <MetricCard
          title="Pedidos Pendentes"
          value={metrics.pedidosPendentes}
          description="em aberto"
          icon={Clock}
          tone="amber"
        />
        <MetricCard
          title="Estoque Baixo"
          value={metrics.materiaisBaixoEstoque}
          description="materiais a repor"
          icon={AlertTriangle}
          tone="rose"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <FinancialCard
          title="Receita"
          value={metrics.receitaMes}
          description="comparado ao mês anterior"
          icon={ArrowUpRight}
          tone="green"
        />
        <FinancialCard
          title="Despesas"
          value={metrics.despesasTotalMes}
          description="comparado ao mês anterior"
          icon={ArrowDownRight}
          tone="rose"
        />
        <FinancialCard
          title="Lucro Estimado"
          value={metrics.lucroMes}
          description="margem estimada do mês"
          icon={Wallet}
          tone="blue"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <LifetimeSalesCard
          title="Receita atual"
          value={metrics.receitaPedidosSistema}
          description="Pedidos prontos, pagos ou entregues, sem vendas antigas."
          icon={ShoppingCart}
        />
        <LifetimeSalesCard
          title="Histórico antigo"
          value={metrics.receitaHistorica}
          description="Vendas cadastradas a partir das anotações em papel."
          icon={History}
        />
        <LifetimeSalesCard
          title="Total vendido desde o início"
          value={metrics.totalVendidoDesdeInicio}
          description="Pedidos atuais somados ao histórico antigo."
          icon={TrendingUp}
          emphasis
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <Card className="rounded-[22px] border-[#eadff4] bg-white shadow-[0_16px_45px_rgba(83,48,122,0.06)]">
          <CardHeader>
            <CardTitle>Receita & Despesas</CardTitle>
            <CardDescription>Últimos 7 dias</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendChart data={metrics.financeiroUltimosDias} />
          </CardContent>
        </Card>

        <StatusSummaryCard statusList={metrics.pedidosPorStatus} />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="rounded-[22px] border-[#eadff4] bg-white shadow-[0_16px_45px_rgba(83,48,122,0.06)]">
          <CardHeader>
            <CardTitle>Pedidos recentes</CardTitle>
            <CardDescription>Últimos pedidos cadastrados</CardDescription>
          </CardHeader>
          <CardContent>
            {metrics.pedidosRecentes.length === 0 ? (
              <EmptyState>Nenhum pedido cadastrado ainda.</EmptyState>
            ) : (
              <div className="space-y-3">
                {metrics.pedidosRecentes.map((pedido) => (
                  <div
                    key={pedido.id}
                    className="flex items-center justify-between gap-3 border-b border-[#f1eaf7] pb-3 last:border-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#15142a]">{pedido.cliente_nome}</p>
                      <RelativeTime date={pedido.data_pedido} />
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="secondary" className={getStatusColor(pedido.status)}>
                        {getStatusLabel(pedido.status)}
                      </Badge>
                      <span className="hidden text-sm font-medium text-[#15142a] sm:inline">
                        {formatCurrency(pedido.valor_total)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[22px] border-[#eadff4] bg-white shadow-[0_16px_45px_rgba(83,48,122,0.06)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Boxes className="h-5 w-5 text-[#9c6ed0]" />
              Estoque baixo
            </CardTitle>
            <CardDescription>Itens que precisam de reposição</CardDescription>
          </CardHeader>
          <CardContent>
            {metrics.materiaisLowStock.length === 0 ? (
              <EmptyState>Todos os materiais estão com estoque adequado.</EmptyState>
            ) : (
              <div className="space-y-3">
                {metrics.materiaisLowStock.map((material) => (
                  <div
                    key={material.id}
                    className="flex items-center justify-between gap-3 border-b border-[#f1eaf7] pb-3 last:border-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#15142a]">{material.nome}</p>
                      <p className="truncate text-xs text-[#706b82]">Tipo: {material.tipo ?? 'sem tipo'}</p>
                    </div>
                    <Badge variant="destructive" className="shrink-0">
                      {getEstoqueAtual(material)} / min {material.quantidade_minima ?? 30}{' '}
                      {material.unidade}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[22px] border-[#eadff4] bg-white shadow-[0_16px_45px_rgba(83,48,122,0.06)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-[#9c6ed0]" />
              Próximas entregas
            </CardTitle>
            <CardDescription>Pedidos previstos para os próximos 7 dias</CardDescription>
          </CardHeader>
          <CardContent>
            {metrics.proximosEntregas.length === 0 ? (
              <EmptyState>
                <span className="inline-flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Nenhuma entrega prevista nos próximos 7 dias.
                </span>
              </EmptyState>
            ) : (
              <div className="space-y-3">
                {metrics.proximosEntregas.map((pedido) => (
                  <div
                    key={pedido.id}
                    className="flex items-center justify-between gap-3 border-b border-[#f1eaf7] pb-3 last:border-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#15142a]">{pedido.cliente_nome}</p>
                      <p className="text-xs text-[#706b82]">{formatCurrency(pedido.valor_total)}</p>
                    </div>
                    <Badge variant="secondary" className={getStatusColor(pedido.status)}>
                      {formatShortDate(pedido.prazo_entrega)}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
