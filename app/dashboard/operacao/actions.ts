'use server'

import { createAuthenticatedClient } from '@/lib/auth'
import { logServerError } from '@/lib/server-log'
import {
  buildOrderMaterialDemand,
  buildStockAlerts,
  calculatePricing,
  getDaysUntil,
  toNumber,
  type MaterialDemandInput,
} from '@/lib/operacao-calculos'
import type {
  Despesa,
  Material,
  MovimentacaoEstoque,
  Pedido,
  PedidoComItens,
  ProdutoComMateriais,
  StatusPedido,
} from '@/lib/types/database'

type MovimentoComMaterial = MovimentacaoEstoque & {
  material?: Pick<Material, 'nome' | 'unidade' | 'tipo'> | Pick<Material, 'nome' | 'unidade' | 'tipo'>[] | null
}

const STATUS_PRODUCAO: StatusPedido[] = [
  'confirmado',
  'separando_materiais',
  'em_producao',
  'pronto',
]

function getMonthRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  }
}

function getMaterialFromJoin<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function groupByStatus(pedidos: PedidoComItens[]) {
  return STATUS_PRODUCAO.map((status) => ({
    status,
    pedidos: pedidos
      .filter((pedido) => pedido.status === status)
      .map((pedido) => ({
        id: pedido.id,
        cliente_nome: pedido.cliente_nome,
        prazo_entrega: pedido.prazo_entrega,
        dias_para_entrega: getDaysUntil(pedido.prazo_entrega),
        valor_total: toNumber(pedido.valor_total),
        itens: pedido.pedido_itens?.length ?? 0,
      })),
  }))
}

function summarizeFinance(pedidos: Pedido[], despesas: Despesa[]) {
  const receita = pedidos
    .filter((pedido) => pedido.status === 'pronto' || pedido.status === 'entregue')
    .reduce((total, pedido) => total + toNumber(pedido.valor_total), 0)
  const receitaRecebida = pedidos
    .filter((pedido) => pedido.status === 'entregue')
    .reduce((total, pedido) => total + toNumber(pedido.valor_total), 0)
  const receitaAberta = Math.max(0, receita - receitaRecebida)
  const totalDespesas = despesas.reduce((total, despesa) => total + toNumber(despesa.valor), 0)
  const despesasPorCategoria = despesas.reduce<Record<string, number>>((acc, despesa) => {
    acc[despesa.categoria] = (acc[despesa.categoria] ?? 0) + toNumber(despesa.valor)
    return acc
  }, {})

  return {
    receita,
    receitaRecebida,
    receitaAberta,
    totalDespesas,
    lucro: receita - totalDespesas,
    despesasPorCategoria,
  }
}

function buildPricing(produtos: ProdutoComMateriais[]) {
  return produtos.slice(0, 20).map((produto) => {
    const custoMateriais = (produto.produto_materiais || []).reduce((total, item) => {
      const material = getMaterialFromJoin(item.material)
      return total + toNumber(material?.custo_unitario) * toNumber(item.quantidade_usada)
    }, 0)
    const resultado = calculatePricing({
      materialCost: custoMateriais,
      laborCost: toNumber(produto.valor_maodeobra),
      marginPercent: toNumber(produto.margem_lucro),
      currentPrice: toNumber(produto.preco_venda),
    })

    return {
      id: produto.id,
      nome: produto.nome,
      preco_venda: toNumber(produto.preco_venda),
      margem_lucro: toNumber(produto.margem_lucro),
      custo_materiais: custoMateriais,
      mao_de_obra: toNumber(produto.valor_maodeobra),
      custo_total: resultado.custo_total,
      preco_sugerido: resultado.preco_sugerido,
      lucro_estimado: resultado.lucro_estimado,
      margem_real: resultado.margem_real,
    }
  })
}

async function getOpenOrderDemand(
  supabase: Awaited<ReturnType<typeof createAuthenticatedClient>>,
  pedidos: PedidoComItens[]
) {
  const pedidosAnalise = pedidos.filter((pedido) => pedido.status !== 'cancelado').slice(0, 25)
  const itens = pedidosAnalise.flatMap((pedido) => pedido.pedido_itens ?? [])
  const itemIds = [...new Set(itens.map((item) => item.id).filter(Boolean))]
  const produtoIds = [...new Set(itens.map((item) => item.produto_id).filter(Boolean))]

  if (itemIds.length === 0) {
    return []
  }

  const [personalizadosResult, produtosResult] = await Promise.all([
    supabase
      .from('pedido_itens_materiais')
      .select('pedido_item_id, material_id, quantidade')
      .in('pedido_item_id', itemIds),
    produtoIds.length > 0
      ? supabase
          .from('produto_materiais')
          .select('produto_id, material_id, quantidade_usada')
          .in('produto_id', produtoIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (personalizadosResult.error) {
    logServerError('operacao_materiais_personalizados_failed', personalizadosResult.error, {
      table: 'pedido_itens_materiais',
    })
  }
  if (produtosResult.error) {
    logServerError('operacao_materiais_produtos_failed', produtosResult.error, {
      table: 'produto_materiais',
    })
  }

  const personalizadosPorItem = new Map<string, MaterialDemandInput[]>()
  for (const material of personalizadosResult.data ?? []) {
    const lista = personalizadosPorItem.get(material.pedido_item_id) ?? []
    lista.push({
      material_id: material.material_id,
      quantidade: toNumber(material.quantidade),
    })
    personalizadosPorItem.set(material.pedido_item_id, lista)
  }

  const materiaisPorProduto = new Map<string, MaterialDemandInput[]>()
  for (const material of produtosResult.data ?? []) {
    const lista = materiaisPorProduto.get(material.produto_id) ?? []
    lista.push({
      material_id: material.material_id,
      quantidade: toNumber(material.quantidade_usada),
    })
    materiaisPorProduto.set(material.produto_id, lista)
  }

  return buildOrderMaterialDemand(
    itens.map((item) => ({
      quantidade: toNumber(item.quantidade),
      materiais_personalizados: personalizadosPorItem.get(item.id),
      materiais_produto: materiaisPorProduto.get(item.produto_id),
    }))
  )
}

export async function getOperacaoData() {
  const supabase = await createAuthenticatedClient()
  const { startIso, endIso, startDate, endDate } = getMonthRange()

  try {
    const [
      pedidosResult,
      materiaisResult,
      movimentosResult,
      pedidosMesResult,
      despesasMesResult,
      produtosResult,
    ] = await Promise.all([
      supabase
        .from('pedidos')
        .select(
          `
          *,
          pedido_itens (
            id,
            produto_id,
            quantidade,
            valor_unitario,
            valor_total,
            produto:produtos (*)
          )
        `
        )
        .eq('ativo', true)
        .in('status', ['confirmado', 'separando_materiais', 'em_producao', 'pronto'])
        .order('prazo_entrega', { ascending: true, nullsFirst: false }),
      supabase.from('materiais').select('*').eq('ativo', true).order('nome'),
      supabase
        .from('movimentacoes_estoque')
        .select('*, material:materiais (nome, unidade, tipo)')
        .order('created_at', { ascending: false })
        .limit(40),
      supabase
        .from('pedidos')
        .select('*')
        .eq('ativo', true)
        .gte('data_pedido', startIso)
        .lte('data_pedido', endIso),
      supabase
        .from('despesas')
        .select('*')
        .eq('ativo', true)
        .is('deleted_at', null)
        .gte('data', startDate)
        .lte('data', endDate),
      supabase
        .from('produtos')
        .select(
          `
          *,
          produto_materiais (
            quantidade_usada,
            material:materiais (id, nome, custo_unitario)
          )
        `
        )
        .eq('ativo', true)
        .order('nome'),
    ])

    if (pedidosResult.error) logServerError('operacao_pedidos_failed', pedidosResult.error, { table: 'pedidos' })
    if (materiaisResult.error) logServerError('operacao_materiais_failed', materiaisResult.error, { table: 'materiais' })
    if (movimentosResult.error) {
      logServerError('operacao_movimentos_failed', movimentosResult.error, {
        table: 'movimentacoes_estoque',
      })
    }
    if (pedidosMesResult.error) logServerError('operacao_pedidos_mes_failed', pedidosMesResult.error, { table: 'pedidos' })
    if (despesasMesResult.error) logServerError('operacao_despesas_mes_failed', despesasMesResult.error, { table: 'despesas' })
    if (produtosResult.error) logServerError('operacao_produtos_failed', produtosResult.error, { table: 'produtos' })

    const pedidos = (pedidosResult.data ?? []) as PedidoComItens[]
    const materiais = (materiaisResult.data ?? []) as Material[]
    const movimentos = (movimentosResult.data ?? []) as MovimentoComMaterial[]
    const pedidosMes = (pedidosMesResult.data ?? []) as Pedido[]
    const despesasMes = (despesasMesResult.data ?? []) as Despesa[]
    const produtos = (produtosResult.data ?? []) as ProdutoComMateriais[]
    const demandas = await getOpenOrderDemand(supabase, pedidos)
    const alertasEstoque = buildStockAlerts(materiais, demandas)
    const financeiro = summarizeFinance(pedidosMes, despesasMes)

    return {
      resumo: {
        pedidosAtivos: pedidos.length,
        alertasCriticos: alertasEstoque.filter((alerta) => alerta.nivel === 'critico').length,
        receitaMes: financeiro.receita,
        lucroMes: financeiro.lucro,
      },
      alertasEstoque,
      kanban: groupByStatus(pedidos),
      auditoria: movimentos.map((movimento) => {
        const material = getMaterialFromJoin(movimento.material)

        return {
          id: movimento.id,
          tipo: movimento.tipo,
          quantidade: toNumber(movimento.quantidade),
          motivo: movimento.motivo,
          pedido_id: movimento.pedido_id,
          created_at: movimento.created_at,
          material_nome: material?.nome ?? 'Material removido',
          material_unidade: material?.unidade ?? 'un',
          material_tipo: material?.tipo ?? null,
          usuario: 'Sistema',
        }
      }),
      precificacao: buildPricing(produtos),
      financeiro,
    }
  } catch (error) {
    logServerError('operacao_data_exception', error)

    return {
      resumo: {
        pedidosAtivos: 0,
        alertasCriticos: 0,
        receitaMes: 0,
        lucroMes: 0,
      },
      alertasEstoque: [],
      kanban: groupByStatus([]),
      auditoria: [],
      precificacao: [],
      financeiro: {
        receita: 0,
        receitaRecebida: 0,
        receitaAberta: 0,
        totalDespesas: 0,
        lucro: 0,
        despesasPorCategoria: {},
      },
    }
  }
}

export type OperacaoData = Awaited<ReturnType<typeof getOperacaoData>>
