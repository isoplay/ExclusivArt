'use server'

import { revalidatePath } from 'next/cache'
import { parseDecimalInput } from '@/lib/number'
import { createAuthenticatedClient } from '@/lib/auth'
import { logServerError } from '@/lib/server-log'
import type { Despesa, CategoriaDespesa, Pedido } from '@/lib/types/database'

const EMPTY_FINANCEIRO_RESUMO = {
  receita: 0,
  totalDespesas: 0,
  lucro: 0,
  totalPedidos: 0,
  pedidosPorStatus: {},
  despesasPorCategoria: {},
  pedidos: [],
  despesas: [],
}

const CATEGORIAS_DESPESA: CategoriaDespesa[] = [
  'material',
  'ferramenta',
  'embalagem',
  'frete',
  'marketing',
  'outro',
]

function isCategoriaDespesa(value: string): value is CategoriaDespesa {
  return CATEGORIAS_DESPESA.includes(value as CategoriaDespesa)
}

function isValidDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
}

function getMonthRange(mes: number, ano: number) {
  const startDate = `${ano}-${String(mes + 1).padStart(2, '0')}-01`
  const lastDay = new Date(ano, mes + 1, 0).getDate()
  const endDate = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  return { startDate, endDate }
}

function getMonthTimestampRange(mes: number, ano: number) {
  const nextMonth = mes === 11 ? 0 : mes + 1
  const nextYear = mes === 11 ? ano + 1 : ano

  return {
    startIso: `${ano}-${String(mes + 1).padStart(2, '0')}-01T00:00:00-03:00`,
    endExclusiveIso: `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-01T00:00:00-03:00`,
  }
}

export async function getDespesas(mes?: number, ano?: number) {
  const supabase = await createAuthenticatedClient()

  try {
    let query = supabase.from('despesas').select('*').order('data', { ascending: false })

    if (mes !== undefined && ano !== undefined) {
      const { startDate, endDate } = getMonthRange(mes, ano)
      query = query.gte('data', startDate).lte('data', endDate)
    }

    const { data, error } = await query

    if (error) {
      logServerError('financeiro_get_despesas_failed', error, { table: 'despesas' })
      return []
    }

    return data as Despesa[]
  } catch (error) {
    logServerError('financeiro_get_despesas_exception', error, { table: 'despesas' })
    return []
  }
}

export async function createDespesa(formData: FormData) {
  const supabase = await createAuthenticatedClient()

  const descricao = formData.get('descricao') as string
  const valor = parseDecimalInput(formData.get('valor'))
  const categoriaInput = String(formData.get('categoria') ?? '')
  const data = formData.get('data') as string

  if (
    !descricao.trim() ||
    descricao.length > 160 ||
    valor < 0 ||
    valor > 1_000_000 ||
    !isCategoriaDespesa(categoriaInput) ||
    !isValidDateInput(data)
  ) {
    return { success: false, error: 'Dados da despesa invalidos' }
  }
  const categoria = categoriaInput

  const { error } = await supabase.from('despesas').insert({
    descricao,
    valor,
    categoria,
    data,
  })

  if (error) {
    logServerError('financeiro_create_despesa_failed', error, { table: 'despesas' })
    return { success: false, error: error.message }
  }

  revalidatePath('/dashboard/financeiro')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function updateDespesa(id: string, formData: FormData) {
  const supabase = await createAuthenticatedClient()

  const descricao = formData.get('descricao') as string
  const valor = parseDecimalInput(formData.get('valor'))
  const categoriaInput = String(formData.get('categoria') ?? '')
  const data = formData.get('data') as string

  if (
    !descricao.trim() ||
    descricao.length > 160 ||
    valor < 0 ||
    valor > 1_000_000 ||
    !isCategoriaDespesa(categoriaInput) ||
    !isValidDateInput(data)
  ) {
    return { success: false, error: 'Dados da despesa invalidos' }
  }
  const categoria = categoriaInput

  const { error } = await supabase
    .from('despesas')
    .update({
      descricao,
      valor,
      categoria,
      data,
    })
    .eq('id', id)

  if (error) {
    logServerError('financeiro_update_despesa_failed', error, { table: 'despesas' })
    return { success: false, error: error.message }
  }

  revalidatePath('/dashboard/financeiro')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function deleteDespesa(id: string) {
  const supabase = await createAuthenticatedClient()

  const { error } = await supabase.from('despesas').delete().eq('id', id)

  if (error) {
    logServerError('financeiro_delete_despesa_failed', error, { table: 'despesas' })
    return { success: false, error: error.message }
  }

  revalidatePath('/dashboard/financeiro')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function getFinanceiroResumo(mes: number, ano: number) {
  const supabase = await createAuthenticatedClient()

  const { startIso, endExclusiveIso } = getMonthTimestampRange(mes, ano)
  const { startDate: startDateOnly, endDate: endDateOnly } = getMonthRange(mes, ano)

  const results = await Promise.all([
    supabase
      .from('pedidos')
      .select('*')
      .eq('ativo', true)
      .gte('data_pedido', startIso)
      .lt('data_pedido', endExclusiveIso),
    supabase
      .from('despesas')
      .select('*')
      .gte('data', startDateOnly)
      .lte('data', endDateOnly),
  ]).catch((error) => {
    logServerError('financeiro_resumo_exception', error)
    return null
  })

  if (!results) {
    return EMPTY_FINANCEIRO_RESUMO
  }

  const [{ data: pedidos, error: pedidosError }, { data: despesas, error: despesasError }] = results

  if (pedidosError) {
    logServerError('financeiro_resumo_pedidos_failed', pedidosError, { table: 'pedidos' })
  }

  if (despesasError) {
    logServerError('financeiro_resumo_despesas_failed', despesasError, { table: 'despesas' })
  }

  if (pedidosError && despesasError) {
    return EMPTY_FINANCEIRO_RESUMO
  }

  const receita = (pedidos || []).reduce((acc: number, p: Pedido) => {
    if (p.status === 'pronto' || p.status === 'entregue') {
      return acc + p.valor_total
    }
    return acc
  }, 0)

  const totalDespesas = (despesas || []).reduce((acc: number, d: Despesa) => acc + d.valor, 0)

  const despesasPorCategoria: Record<string, number> = {}
  ;(despesas || []).forEach((d: Despesa) => {
    despesasPorCategoria[d.categoria] = (despesasPorCategoria[d.categoria] || 0) + d.valor
  })

  const pedidosPorStatus: Record<string, number> = {}
  ;(pedidos || []).forEach((p: Pedido) => {
    pedidosPorStatus[p.status] = (pedidosPorStatus[p.status] || 0) + 1
  })

  return {
    receita,
    totalDespesas,
    lucro: receita - totalDespesas,
    totalPedidos: pedidos?.length || 0,
    pedidosPorStatus,
    despesasPorCategoria,
    pedidos: pedidos || [],
    despesas: despesas || [],
  }
}
