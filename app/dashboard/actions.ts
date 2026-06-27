'use server'

import { createAuthenticatedClient } from '@/lib/auth'
import {
  STATUS_PEDIDO_OPTIONS,
  type Despesa,
  type Material,
  type Pedido,
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

function getEstoqueAtual(material: Material) {
  return toNumber(material.quantidade_atual ?? material.quantidade)
}

function toNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function toDateKey(value: unknown) {
  return String(value ?? '').split('T')[0]
}

export async function getDashboardMetrics() {
  const supabase = await createAuthenticatedClient()

  const now = new Date()
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const lastDayOfMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59,
    999
  ).toISOString()
  const inSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]
  const lastSevenDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now)
    date.setDate(now.getDate() - (6 - index))
    date.setHours(0, 0, 0, 0)
    return date
  })
  const sevenDaysAgo = lastSevenDays[0].toISOString()

  const results = await Promise.all([
    supabase
      .from('pedidos')
      .select('*')
      .eq('ativo', true)
      .gte('data_pedido', firstDayOfMonth)
      .lte('data_pedido', lastDayOfMonth),

    supabase
      .from('pedidos')
      .select('valor_total,status')
      .eq('ativo', true)
      .in('status', ['pronto', 'entregue']),

    supabase
      .from('vendas_historicas')
      .select('valor_total'),

    supabase
      .from('pedidos')
      .select('*')
      .eq('ativo', true)
      .in('status', ['orcamento', 'confirmado', 'em_producao', 'pronto']),

    supabase
      .from('materiais')
      .select('*')
      .eq('ativo', true),

    supabase
      .from('despesas')
      .select('*')
      .gte('data', firstDayOfMonth)
      .lte('data', lastDayOfMonth),

    supabase
      .from('pedidos')
      .select('*')
      .eq('ativo', true)
      .order('data_pedido', { ascending: false })
      .limit(5),

    supabase
      .from('pedidos')
      .select('*')
      .eq('ativo', true)
      .in('status', ['orcamento', 'confirmado', 'em_producao', 'pronto'])
      .not('prazo_entrega', 'is', null)
      .lte('prazo_entrega', inSevenDays)
      .gte('prazo_entrega', now.toISOString().split('T')[0])
      .order('prazo_entrega', { ascending: true })
      .limit(7),

    supabase
      .from('pedidos')
      .select('*')
      .eq('ativo', true)
      .gte('data_pedido', sevenDaysAgo),

    supabase
      .from('despesas')
      .select('*')
      .gte('data', sevenDaysAgo.split('T')[0]),
  ]).catch((error) => {
    logServerError('dashboard_metrics_exception', error)
    return null
  })

  if (!results) {
    return EMPTY_DASHBOARD_METRICS
  }

  const [
    pedidosMesResult,
    todosPedidosReceitaResult,
    vendasHistoricasResult,
    pedidosPendentesResult,
    todosMateriaisResult,
    despesasMesResult,
    pedidosRecentesResult,
    proximosEntregasResult,
    pedidosUltimosDiasResult,
    despesasUltimosDiasResult,
  ] = results

  const { data: pedidosMes, error: pedidosError } = pedidosMesResult

  if (pedidosError) {
    logServerError('dashboard_pedidos_mes_failed', pedidosError, { table: 'pedidos' })
  }

  const { data: todosPedidosReceita, error: todosPedidosReceitaError } = todosPedidosReceitaResult

  if (todosPedidosReceitaError) {
    logServerError('dashboard_todos_pedidos_receita_failed', todosPedidosReceitaError, {
      table: 'pedidos',
    })
  }

  const { data: vendasHistoricas, error: vendasHistoricasError } = vendasHistoricasResult

  if (vendasHistoricasError) {
    logServerError('dashboard_vendas_historicas_failed', vendasHistoricasError, {
      table: 'vendas_historicas',
    })
  }

  const { data: pedidosPendentes, error: pendentesError } = pedidosPendentesResult

  if (pendentesError) {
    logServerError('dashboard_pedidos_pendentes_failed', pendentesError, { table: 'pedidos' })
  }

  const { data: todosMateriais, error: materiaisError } = todosMateriaisResult

  if (materiaisError) {
    logServerError('dashboard_materiais_failed', materiaisError, { table: 'materiais' })
  }

  const materiaisLowStock =
    todosMateriais?.filter((m: Material) => {
      const atual = getEstoqueAtual(m)
      const minimo = m.quantidade_minima ?? 30
      return atual <= minimo
    }) || []
  const materiaisSemEstoque =
    todosMateriais?.filter((m: Material) => getEstoqueAtual(m) <= 0) || []

  const { data: despesasMes, error: despesasError } = despesasMesResult

  if (despesasError) {
    logServerError('dashboard_despesas_mes_failed', despesasError, { table: 'despesas' })
  }

  const receitaMes = (pedidosMes || []).reduce((acc: number, p: Pedido) => {
    if (p.status === 'pronto' || p.status === 'entregue') {
      return acc + toNumber(p.valor_total)
    }
    return acc
  }, 0)
  const receitaPedidosSistema = (todosPedidosReceita || []).reduce(
    (acc: number, pedido: Pick<Pedido, 'valor_total' | 'status'>) => {
      return acc + toNumber(pedido.valor_total)
    },
    0
  )
  const receitaHistorica = (vendasHistoricas || []).reduce(
    (acc: number, venda: { valor_total: unknown }) => acc + toNumber(venda.valor_total),
    0
  )

  const despesasTotalMes = (despesasMes || []).reduce(
    (acc: number, d: Despesa) => acc + toNumber(d.valor),
    0
  )

  const pedidosPorStatus = STATUS_PEDIDO_OPTIONS.map((statusOption) => ({
    status: statusOption.value,
    label: statusOption.label,
    className: statusOption.className,
    total: (pedidosMes || []).filter((pedido: Pedido) => pedido.status === statusOption.value)
      .length,
  })).filter((status) => status.total > 0)

  const { data: pedidosRecentes, error: pedidosRecentesError } = pedidosRecentesResult
  const { data: proximosEntregas, error: proximosEntregasError } = proximosEntregasResult
  const { data: pedidosUltimosDias, error: pedidosUltimosDiasError } = pedidosUltimosDiasResult
  const { data: despesasUltimosDias, error: despesasUltimosDiasError } = despesasUltimosDiasResult

  if (pedidosRecentesError) {
    logServerError('dashboard_pedidos_recentes_failed', pedidosRecentesError, { table: 'pedidos' })
  }

  if (proximosEntregasError) {
    logServerError('dashboard_proximas_entregas_failed', proximosEntregasError, { table: 'pedidos' })
  }

  if (pedidosUltimosDiasError) {
    logServerError('dashboard_pedidos_ultimos_dias_failed', pedidosUltimosDiasError, { table: 'pedidos' })
  }

  if (despesasUltimosDiasError) {
    logServerError('dashboard_despesas_ultimos_dias_failed', despesasUltimosDiasError, { table: 'despesas' })
  }

  const labels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']
  const financeiroUltimosDias = lastSevenDays.map((day) => {
    const key = day.toISOString().split('T')[0]
    const receita = (pedidosUltimosDias || []).reduce((acc: number, pedido: Pedido) => {
      if (
        !['pronto', 'entregue'].includes(pedido.status) ||
        toDateKey(pedido.data_pedido) !== key
      ) {
        return acc
      }

      return acc + toNumber(pedido.valor_total)
    }, 0)
    const despesas = (despesasUltimosDias || []).reduce((acc: number, despesa: Despesa) => {
      if (toDateKey(despesa.data) !== key) {
        return acc
      }

      return acc + toNumber(despesa.valor)
    }, 0)

    return {
      dia: labels[day.getDay()],
      receita,
      despesas,
    }
  })

  return {
    totalPedidosMes: pedidosMes?.length || 0,
    receitaMes,
    receitaPedidosSistema,
    receitaHistorica,
    totalVendidoDesdeInicio: receitaPedidosSistema + receitaHistorica,
    pedidosPendentes: pedidosPendentes?.length || 0,
    materiaisSemEstoque: materiaisSemEstoque.length,
    materiaisBaixoEstoque: materiaisLowStock.length,
    despesasTotalMes,
    lucroMes: receitaMes - despesasTotalMes,
    pedidosPorStatus,
    financeiroUltimosDias,
    pedidosRecentes: pedidosRecentes || [],
    proximosEntregas: proximosEntregas || [],
    materiaisLowStock: materiaisLowStock.slice(0, 5),
  }
}
