'use server'

import { createAuthenticatedClient } from '@/lib/auth'
import {
  STATUS_PEDIDO_OPTIONS,
  type Despesa,
  type Material,
  type Pedido,
} from '@/lib/types/database'

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

  const [
    pedidosMesResult,
    pedidosPendentesResult,
    todosMateriaisResult,
    despesasMesResult,
    pedidosRecentesResult,
    proximosEntregasResult,
    pedidosUltimosDiasResult,
    despesasUltimosDiasResult,
  ] = await Promise.all([
    supabase
      .from('pedidos')
      .select('*')
      .gte('data_pedido', firstDayOfMonth)
      .lte('data_pedido', lastDayOfMonth),

    supabase
      .from('pedidos')
      .select('*')
      .in('status', ['orcamento', 'confirmado', 'em_producao', 'pronto']),

    supabase
      .from('materiais')
      .select('*'),

    supabase
      .from('despesas')
      .select('*')
      .gte('data', firstDayOfMonth)
      .lte('data', lastDayOfMonth),

    supabase
      .from('pedidos')
      .select('*')
      .order('data_pedido', { ascending: false })
      .limit(5),

    supabase
      .from('pedidos')
      .select('*')
      .in('status', ['orcamento', 'confirmado', 'em_producao', 'pronto'])
      .not('prazo_entrega', 'is', null)
      .lte('prazo_entrega', inSevenDays)
      .gte('prazo_entrega', now.toISOString().split('T')[0])
      .order('prazo_entrega', { ascending: true })
      .limit(7),

    supabase
      .from('pedidos')
      .select('*')
      .gte('data_pedido', sevenDaysAgo),

    supabase
      .from('despesas')
      .select('*')
      .gte('data', sevenDaysAgo.split('T')[0]),
  ])

  const { data: pedidosMes, error: pedidosError } = pedidosMesResult

  if (pedidosError) {
    console.error('Error fetching pedidos:', pedidosError)
  }

  const { data: pedidosPendentes, error: pendentesError } = pedidosPendentesResult

  if (pendentesError) {
    console.error('Error fetching pending orders:', pendentesError)
  }

  const { data: todosMateriais, error: materiaisError } = todosMateriaisResult

  if (materiaisError) {
    console.error('Error fetching materials:', materiaisError)
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
    console.error('Error fetching despesas:', despesasError)
  }

  const receitaMes = (pedidosMes || []).reduce((acc: number, p: Pedido) => {
    if (p.status !== 'cancelado') {
      return acc + toNumber(p.valor_total)
    }
    return acc
  }, 0)

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
    console.error('Error fetching recent orders:', pedidosRecentesError)
  }

  if (proximosEntregasError) {
    console.error('Error fetching upcoming deliveries:', proximosEntregasError)
  }

  if (pedidosUltimosDiasError) {
    console.error('Error fetching last week orders:', pedidosUltimosDiasError)
  }

  if (despesasUltimosDiasError) {
    console.error('Error fetching last week expenses:', despesasUltimosDiasError)
  }

  const labels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']
  const financeiroUltimosDias = lastSevenDays.map((day) => {
    const key = day.toISOString().split('T')[0]
    const receita = (pedidosUltimosDias || []).reduce((acc: number, pedido: Pedido) => {
      if (pedido.status === 'cancelado' || toDateKey(pedido.data_pedido) !== key) {
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
