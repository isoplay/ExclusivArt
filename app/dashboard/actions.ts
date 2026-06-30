'use server'

import { createAuthenticatedClient } from '@/lib/auth'
import {
  STATUS_PEDIDO_OPTIONS,
  type Material,
  type Pedido,
  type StatusPedido,
} from '@/lib/types/database'
import { logServerError } from '@/lib/server-log'

const EMPTY_DASHBOARD_METRICS = {
  totalPedidosMes: 0,
  receitaMes: 0,
  receitaPedidosSistema: 0,
  receitaHistorica: 0,
  totalVendidoDesdeInicio: 0,
  pedidosPendentes: 0,
  materiaisSemEstoque: 0,
  materiaisBaixoEstoque: 0,
  despesasTotalMes: 0,
  lucroMes: 0,
  pedidosPorStatus: [],
  financeiroUltimosDias: [
    { dia: 'Seg', receita: 0, despesas: 0 },
    { dia: 'Ter', receita: 0, despesas: 0 },
    { dia: 'Qua', receita: 0, despesas: 0 },
    { dia: 'Qui', receita: 0, despesas: 0 },
    { dia: 'Sex', receita: 0, despesas: 0 },
    { dia: 'Sab', receita: 0, despesas: 0 },
    { dia: 'Dom', receita: 0, despesas: 0 },
  ],
  pedidosRecentes: [],
  proximosEntregas: [],
  materiaisLowStock: [],
}

type DashboardMetricsRpc = {
  total_pedidos_mes?: unknown
  receita_mes?: unknown
  receita_pedidos_sistema?: unknown
  receita_historica?: unknown
  pedidos_pendentes?: unknown
  materiais_sem_estoque?: unknown
  materiais_baixo_estoque?: unknown
  despesas_total_mes?: unknown
  pedidos_por_status?: Array<{ status?: unknown; total?: unknown }>
  financeiro_ultimos_dias?: Array<{
    data?: unknown
    receita?: unknown
    despesas?: unknown
  }>
  pedidos_recentes?: Pedido[]
  proximas_entregas?: Pedido[]
  materiais_low_stock?: Material[]
}

function toNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function getDayLabel(value: unknown) {
  const date = new Date(`${String(value ?? '')}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return ''

  return ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'][date.getUTCDay()]
}

function isStatusPedido(value: unknown): value is StatusPedido {
  return STATUS_PEDIDO_OPTIONS.some((option) => option.value === value)
}

export async function getDashboardMetrics() {
  const supabase = await createAuthenticatedClient()
  const { data, error } = await supabase.rpc('get_dashboard_metrics')

  if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
    logServerError('dashboard_metrics_rpc_failed', error ?? new Error('Resposta RPC invalida'), {
      function: 'get_dashboard_metrics',
    })
    return EMPTY_DASHBOARD_METRICS
  }

  const metrics = data as unknown as DashboardMetricsRpc
  const statusTotals = new Map<StatusPedido, number>()

  for (const item of metrics.pedidos_por_status ?? []) {
    if (isStatusPedido(item.status)) {
      statusTotals.set(item.status, toNumber(item.total))
    }
  }

  const receitaMes = toNumber(metrics.receita_mes)
  const receitaPedidosSistema = toNumber(metrics.receita_pedidos_sistema)
  const receitaHistorica = toNumber(metrics.receita_historica)
  const despesasTotalMes = toNumber(metrics.despesas_total_mes)

  return {
    totalPedidosMes: toNumber(metrics.total_pedidos_mes),
    receitaMes,
    receitaPedidosSistema,
    receitaHistorica,
    totalVendidoDesdeInicio: receitaPedidosSistema + receitaHistorica,
    pedidosPendentes: toNumber(metrics.pedidos_pendentes),
    materiaisSemEstoque: toNumber(metrics.materiais_sem_estoque),
    materiaisBaixoEstoque: toNumber(metrics.materiais_baixo_estoque),
    despesasTotalMes,
    lucroMes: receitaMes - despesasTotalMes,
    pedidosPorStatus: STATUS_PEDIDO_OPTIONS.map((option) => ({
      status: option.value,
      label: option.label,
      className: option.className,
      total: statusTotals.get(option.value) ?? 0,
    })).filter((item) => item.total > 0),
    financeiroUltimosDias: (metrics.financeiro_ultimos_dias ?? []).map((item) => ({
      dia: getDayLabel(item.data),
      receita: toNumber(item.receita),
      despesas: toNumber(item.despesas),
    })),
    pedidosRecentes: metrics.pedidos_recentes ?? [],
    proximosEntregas: metrics.proximas_entregas ?? [],
    materiaisLowStock: metrics.materiais_low_stock ?? [],
  }
}
