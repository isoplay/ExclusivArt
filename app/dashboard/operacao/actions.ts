'use server'

import { createAuthenticatedClient } from '@/lib/auth'
import { logServerError } from '@/lib/server-log'
import {
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
import { getMateriaisBaixaPedido } from '../pedidos/actions'

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
    .filter((pedido) => pedido.status !== 'cancelado')
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

async function getOpenOrderDemand(pedidos: PedidoComItens[]) {
  const demandas: MaterialDemandInput[] = []
  const pedidosAnalise = pedidos.filter((pedido) => pedido.status !== 'cancelado').slice(0, 25)

  for (const pedido of pedidosAnalise) {
    const materiais = await getMateriaisBaixaPedido(pedido.id)
    materiais.forEach((material) => {
      demandas.push({
        material_id: material.material_id,
        quantidade: material.quantidade,
      })
    })
  }

  return demandas
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
            quantidade,
            valor_unitario,
            valor_total,
            produto:produtos (*)
          )
        `
        )
        .in('status', ['confirmado', 'separando_materiais', 'em_producao', 'pronto'])
        .order('prazo_entrega', { ascending: true, nullsFirst: false }),
      supabase.from('materiais').select('*').order('nome'),
      supabase
        .from('movimentacoes_estoque')
        .select('*, material:materiais (nome, unidade, tipo)')
        .order('created_at', { ascending: false })
        .limit(40),
      supabase
        .from('pedidos')
        .select('*')
        .gte('data_pedido', startIso)
        .lte('data_pedido', endIso),
      supabase
        .from('despesas')
        .select('*')
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
    const demandas = await getOpenOrderDemand(pedidos)
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
