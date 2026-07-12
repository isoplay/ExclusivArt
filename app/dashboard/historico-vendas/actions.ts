'use server'

import { revalidatePath } from 'next/cache'
import { createAuthenticatedClient } from '@/lib/auth'
import { parseDecimalInput } from '@/lib/number'
import { logServerError } from '@/lib/server-log'
import { isValidDateOnly } from '@/lib/security/input'
import type { StatusPedido, VendaHistorica } from '@/lib/types/database'

export type HistoricoVendasFilters = {
  inicio?: string
  fim?: string
  busca?: string
  ordem?: 'asc' | 'desc'
}

export type HistoricoVendasResumo = {
  totalVendido: number
  quantidadeVendas: number
  vendasPapel: number
  pedidosSincronizados: number
  primeiraVenda: string | null
  ultimaVenda: string | null
}

export type HistoricoVendasChartItem = {
  label: string
  valor: number
  quantidade: number
}

export type HistoricoVendaOrigem = 'papel' | 'pedido_pronto' | 'pedido_pago' | 'pedido_entregue'

export type HistoricoVendaRegistro = {
  id: string
  data_venda: string
  cliente_nome: string | null
  descricao: string
  quantidade: number
  valor_total: number
  origem: HistoricoVendaOrigem
  observacoes: string | null
  created_at: string | null
  pedido_id?: string
  status_pedido?: StatusPedido
}

export type HistoricoVendasData = {
  vendas: HistoricoVendaRegistro[]
  resumo: HistoricoVendasResumo
  vendasPorMes: HistoricoVendasChartItem[]
  vendasPorAno: HistoricoVendasChartItem[]
}

const EMPTY_HISTORICO_VENDAS: HistoricoVendasData = {
  vendas: [],
  resumo: {
    totalVendido: 0,
    quantidadeVendas: 0,
    vendasPapel: 0,
    pedidosSincronizados: 0,
    primeiraVenda: null,
    ultimaVenda: null,
  },
  vendasPorMes: [],
  vendasPorAno: [],
}

type CsvRow = Record<string, string>

type ProdutoResumo = {
  nome: string | null
}

type PedidoHistoricoItemRow = {
  quantidade: number | null
  produto?: ProdutoResumo | ProdutoResumo[] | null
}

type PedidoHistoricoRow = {
  id: string
  cliente_nome: string | null
  prazo_entrega: string | null
  status: StatusPedido
  valor_total: unknown
  data_pedido: string | null
  pedido_itens?: PedidoHistoricoItemRow[] | null
}

const PEDIDOS_HISTORICO_STATUS: StatusPedido[] = ['pronto', 'pago', 'pago_entregue', 'entregue']

function sanitizeDate(value: unknown) {
  const date = String(value ?? '').trim()
  return isValidDateOnly(date) ? date : ''
}

function normalizeDateCell(value: string) {
  const trimmed = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return isValidDateOnly(trimmed) ? trimmed : ''
  }

  const brDate = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!brDate) {
    return ''
  }

  const [, day, month, year] = brDate
  const normalized = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  return isValidDateOnly(normalized) ? normalized : ''
}

function cleanText(value: FormDataEntryValue | string | null | undefined, maxLength: number) {
  const text = String(value ?? '').trim()
  return text.length > maxLength ? text.slice(0, maxLength) : text
}

function parseQuantidade(value: FormDataEntryValue | string | null | undefined) {
  const parsed = Number.parseInt(String(value ?? '1'), 10)
  return Number.isFinite(parsed) ? parsed : 1
}

function toNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeHistoricoVenda(venda: VendaHistorica): HistoricoVendaRegistro {
  return {
    id: venda.id,
    data_venda: venda.data_venda,
    cliente_nome: venda.cliente_nome,
    descricao: venda.descricao,
    quantidade: venda.quantidade,
    valor_total: toNumber(venda.valor_total),
    origem: 'papel',
    observacoes: venda.observacoes,
    created_at: venda.created_at,
  }
}

function getProdutoNome(produto: PedidoHistoricoItemRow['produto']) {
  const produtoResumo = Array.isArray(produto) ? produto[0] : produto
  return produtoResumo?.nome?.trim() || 'Produto personalizado'
}

function getPedidoHistoricoDate(pedido: PedidoHistoricoRow) {
  const dataPedido = sanitizeDate(String(pedido.data_pedido ?? '').split('T')[0])
  if (dataPedido) {
    return dataPedido
  }

  return sanitizeDate(pedido.prazo_entrega)
}

function buildPedidoHistoricoDescricao(pedido: PedidoHistoricoRow) {
  const itens = pedido.pedido_itens ?? []

  if (itens.length === 0) {
    return 'Pedido personalizado'
  }

  return itens
    .map((item) => {
      const quantidade = Math.max(1, toNumber(item.quantidade))
      return `${getProdutoNome(item.produto)} (${quantidade}x)`
    })
    .join(', ')
}

function pedidoToHistoricoRegistro(pedido: PedidoHistoricoRow): HistoricoVendaRegistro | null {
  const dataVenda = getPedidoHistoricoDate(pedido)

  if (!dataVenda) {
    return null
  }

  const quantidade = (pedido.pedido_itens ?? []).reduce(
    (acc, item) => acc + Math.max(0, toNumber(item.quantidade)),
    0
  )

  return {
    id: `pedido-${pedido.id}`,
    pedido_id: pedido.id,
    data_venda: dataVenda,
    cliente_nome: pedido.cliente_nome,
    descricao: buildPedidoHistoricoDescricao(pedido),
    quantidade: quantidade || 1,
    valor_total: toNumber(pedido.valor_total),
    origem:
      pedido.status === 'pago'
        ? 'pedido_pago'
        : pedido.status === 'pago_entregue' || pedido.status === 'entregue'
          ? 'pedido_entregue'
          : 'pedido_pronto',
    observacoes: null,
    created_at: pedido.data_pedido,
    status_pedido: pedido.status,
  }
}

function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number)
  const date = new Date(year, month - 1, 1)
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function buildHistoricoData(vendas: HistoricoVendaRegistro[]): HistoricoVendasData {
  const sortedByDate = [...vendas].sort((a, b) => a.data_venda.localeCompare(b.data_venda))
  const totalVendido = vendas.reduce((acc, venda) => acc + toNumber(venda.valor_total), 0)
  const vendasPapel = vendas.filter((venda) => venda.origem === 'papel').length
  const pedidosSincronizados = vendas.length - vendasPapel
  const monthMap = new Map<string, HistoricoVendasChartItem>()
  const yearMap = new Map<string, HistoricoVendasChartItem>()

  sortedByDate.forEach((venda) => {
    const monthKey = venda.data_venda.slice(0, 7)
    const yearKey = venda.data_venda.slice(0, 4)
    const valor = toNumber(venda.valor_total)

    const currentMonth = monthMap.get(monthKey) ?? {
      label: formatMonthLabel(monthKey),
      valor: 0,
      quantidade: 0,
    }
    currentMonth.valor += valor
    currentMonth.quantidade += 1
    monthMap.set(monthKey, currentMonth)

    const currentYear = yearMap.get(yearKey) ?? {
      label: yearKey,
      valor: 0,
      quantidade: 0,
    }
    currentYear.valor += valor
    currentYear.quantidade += 1
    yearMap.set(yearKey, currentYear)
  })

  return {
    vendas,
    resumo: {
      totalVendido,
      quantidadeVendas: vendas.length,
      vendasPapel,
      pedidosSincronizados,
      primeiraVenda: sortedByDate[0]?.data_venda ?? null,
      ultimaVenda: sortedByDate[sortedByDate.length - 1]?.data_venda ?? null,
    },
    vendasPorMes: Array.from(monthMap.values()),
    vendasPorAno: Array.from(yearMap.values()),
  }
}

function isWithinPeriod(venda: HistoricoVendaRegistro, inicio: string, fim: string) {
  if (inicio && venda.data_venda < inicio) {
    return false
  }

  if (fim && venda.data_venda > fim) {
    return false
  }

  return true
}

function matchesSearch(venda: HistoricoVendaRegistro, busca: string) {
  const target = `${venda.cliente_nome ?? ''} ${venda.descricao}`.toLowerCase()
  return target.includes(busca.toLowerCase())
}

export async function getHistoricoVendas(filters: HistoricoVendasFilters = {}) {
  const supabase = await createAuthenticatedClient()
  const inicio = sanitizeDate(filters.inicio)
  const fim = sanitizeDate(filters.fim)
  const busca = String(filters.busca ?? '').trim()
  const ascending = filters.ordem !== 'desc'

  try {
    const vendasQuery = supabase
      .from('vendas_historicas')
      .select('*')
      .order('data_venda', { ascending })
      .limit(5000)

    const pedidosQuery = supabase
      .from('pedidos')
      .select(
        `
          id,
          cliente_nome,
          prazo_entrega,
          status,
          valor_total,
          data_pedido,
          pedido_itens (
            quantidade,
            produto:produtos (
              nome
            )
          )
        `
      )
      .eq('ativo', true)
      .in('status', PEDIDOS_HISTORICO_STATUS)
      .order('data_pedido', { ascending })
      .limit(5000)

    const [vendasResult, pedidosResult] = await Promise.all([vendasQuery, pedidosQuery])
    const registros: HistoricoVendaRegistro[] = []

    if (vendasResult.error) {
      logServerError('historico_vendas_get_failed', vendasResult.error, {
        table: 'vendas_historicas',
      })
    } else {
      registros.push(...((vendasResult.data ?? []) as VendaHistorica[]).map(normalizeHistoricoVenda))
    }

    if (pedidosResult.error) {
      logServerError('historico_vendas_pedidos_get_failed', pedidosResult.error, {
        table: 'pedidos',
        statuses: PEDIDOS_HISTORICO_STATUS.join(','),
      })
    } else {
      const pedidos = ((pedidosResult.data ?? []) as PedidoHistoricoRow[])
        .map(pedidoToHistoricoRegistro)
        .filter((pedido): pedido is HistoricoVendaRegistro => Boolean(pedido))
      registros.push(...pedidos)
    }

    const vendas = registros
      .filter((venda) => isWithinPeriod(venda, inicio, fim))
      .filter((venda) => (busca ? matchesSearch(venda, busca) : true))
      .sort((a, b) =>
        ascending
          ? a.data_venda.localeCompare(b.data_venda)
          : b.data_venda.localeCompare(a.data_venda)
      )

    return buildHistoricoData(vendas)
  } catch (error) {
    logServerError('historico_vendas_get_exception', error, {
      table: 'vendas_historicas',
    })
    return EMPTY_HISTORICO_VENDAS
  }
}

export async function createVendaHistorica(formData: FormData) {
  const supabase = await createAuthenticatedClient()

  const dataVenda = sanitizeDate(formData.get('data_venda'))
  const clienteNome = cleanText(formData.get('cliente_nome'), 160) || null
  const descricao = cleanText(formData.get('descricao'), 240)
  const quantidade = parseQuantidade(formData.get('quantidade'))
  const valorTotal = parseDecimalInput(formData.get('valor_total'))
  const observacoes = cleanText(formData.get('observacoes'), 1200) || null

  if (!dataVenda) {
    return { success: false, error: 'Informe a data da venda.' }
  }

  if (!descricao) {
    return { success: false, error: 'Informe a descricao da venda.' }
  }

  if (quantidade <= 0 || quantidade > 100_000) {
    return { success: false, error: 'A quantidade precisa ser maior que zero.' }
  }

  if (valorTotal < 0 || valorTotal > 1_000_000_000) {
    return { success: false, error: 'Informe um valor total valido.' }
  }

  const { error } = await supabase.from('vendas_historicas').insert({
    data_venda: dataVenda,
    cliente_nome: clienteNome,
    descricao,
    quantidade,
    valor_total: valorTotal,
    origem: 'papel',
    observacoes,
  })

  if (error) {
    logServerError('historico_vendas_create_failed', error, {
      table: 'vendas_historicas',
    })
    return { success: false, error: 'Nao foi possivel cadastrar a venda' }
  }

  revalidatePath('/dashboard/historico-vendas')
  revalidatePath('/dashboard')
  return { success: true }
}

function detectDelimiter(headerLine: string) {
  return headerLine.includes(';') ? ';' : ','
}

function parseCsvLine(line: string, delimiter: string) {
  const cells: string[] = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]

    if (char === '"' && inQuotes && next === '"') {
      current += '"'
      index += 1
      continue
    }

    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }

    if (char === delimiter && !inQuotes) {
      cells.push(current.trim())
      current = ''
      continue
    }

    current += char
  }

  cells.push(current.trim())
  return cells
}

function parseCsv(text: string) {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized.split('\n').filter((line) => line.trim())

  if (lines.length < 2) {
    return []
  }

  const delimiter = detectDelimiter(lines[0])
  const headers = parseCsvLine(lines[0], delimiter).map((header) => header.trim())

  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line, delimiter)
    return headers.reduce<CsvRow>((row, header, index) => {
      row[header] = cells[index] ?? ''
      return row
    }, {})
  })
}

function validateCsvRow(row: CsvRow, index: number) {
  const dataVenda = normalizeDateCell(row.data_venda ?? '')
  const descricao = cleanText(row.descricao ?? '', 240)
  const quantidade = parseQuantidade(row.quantidade ?? '1')
  const valorTotal = parseDecimalInput(row.valor_total ?? '')

  if (!dataVenda) {
    return { error: `Linha ${index}: data_venda invalida.` }
  }

  if (!descricao) {
    return { error: `Linha ${index}: descricao obrigatoria.` }
  }

  if (quantidade <= 0 || quantidade > 100_000) {
    return { error: `Linha ${index}: quantidade invalida.` }
  }

  if (valorTotal < 0 || valorTotal > 1_000_000_000) {
    return { error: `Linha ${index}: valor_total invalido.` }
  }

  return {
    venda: {
      data_venda: dataVenda,
      cliente_nome: cleanText(row.cliente_nome ?? '', 160) || null,
      descricao,
      quantidade,
      valor_total: valorTotal,
      origem: 'papel',
      observacoes: cleanText(row.observacoes ?? '', 1200) || null,
    },
  }
}

export async function importVendasHistoricasCsv(formData: FormData) {
  const supabase = await createAuthenticatedClient()
  const arquivo = formData.get('arquivo')

  if (!arquivo || typeof arquivo === 'string') {
    return { success: false, error: 'Selecione um arquivo CSV.' }
  }

  if (arquivo.size > 1_000_000) {
    return { success: false, error: 'Envie um CSV de ate 1 MB.' }
  }

  const rows = parseCsv(await arquivo.text())

  if (rows.length === 0) {
    return { success: false, error: 'CSV vazio ou sem linhas de venda.' }
  }

  if (rows.length > 500) {
    return { success: false, error: 'Importe no maximo 500 vendas por vez.' }
  }

  const vendas = []
  const errors = []

  for (const [index, row] of rows.entries()) {
    const result = validateCsvRow(row, index + 2)
    if (result.error) {
      errors.push(result.error)
    } else if (result.venda) {
      vendas.push(result.venda)
    }
  }

  if (errors.length > 0) {
    return {
      success: false,
      error: errors.slice(0, 5).join(' '),
    }
  }

  const { error } = await supabase.from('vendas_historicas').insert(vendas)

  if (error) {
    logServerError('historico_vendas_import_failed', error, {
      table: 'vendas_historicas',
      count: vendas.length,
    })
    return { success: false, error: 'Nao foi possivel importar as vendas' }
  }

  revalidatePath('/dashboard/historico-vendas')
  revalidatePath('/dashboard')
  return { success: true, count: vendas.length }
}
