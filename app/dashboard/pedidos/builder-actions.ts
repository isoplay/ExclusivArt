'use server'

import { revalidatePath } from 'next/cache'
import { createAuthenticatedClient } from '@/lib/auth'
import type { SupabaseClient } from '@supabase/supabase-js'
import { arredondarParaCimaMeioReal } from '@/lib/utils'
import { logServerError } from '@/lib/server-log'

function cleanOptionalText(value: unknown, maxLength = 1200) {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ')
  if (!text) return null
  return text.slice(0, maxLength)
}

async function resolveProdutoIdForCategoria(
  supabase: SupabaseClient,
  categoriaId: string
): Promise<string | null> {
  const tipoMap: Record<string, string> = {
    terco: 'terco',
    terço: 'terco',
    pulseira: 'pulseira',
    chaveiro: 'chaveiro',
  }

  const { data: categoria } = await supabase
    .from('categorias_produtos')
    .select('nome')
    .eq('id', categoriaId)
    .maybeSingle()

  const nomeNorm = categoria?.nome
    ?.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  const tipo = (nomeNorm && tipoMap[nomeNorm]) || 'outro'

  const { data: porTipo } = await supabase
    .from('produtos')
    .select('id')
    .eq('tipo', tipo)
    .eq('ativo', true)
    .limit(1)
    .maybeSingle()

  if (porTipo?.id) return porTipo.id

  const { data: qualquer } = await supabase
    .from('produtos')
    .select('id')
    .eq('ativo', true)
    .limit(1)
    .maybeSingle()

  return qualquer?.id ?? null
}

import type {
  CategoriaProduto,
  VariacaoTipo,
  GrupoComponente,
  ComponenteDisponivel,
  ConfiguracaoMaodeobra,
  CategoriaCompleta,
} from '@/lib/types/database'

/**
 * Get all active product categories with their variations and component groups
 */
export async function getCategorias() {
  const supabase = await createAuthenticatedClient()

  const { data, error } = await supabase
    .from('categorias_produtos')
    .select(
      `
      id,
      nome,
      descricao,
      ativo,
      ordem,
      created_at,
      updated_at,
      variacoes_tipo (
        id,
        nome,
        descricao,
        ativo,
        ordem,
        created_at,
        updated_at
      ),
      grupos_componentes (
        id,
        nome,
        descricao,
        obrigatorio,
        permite_multipla_selecao,
        ordem,
        ativo,
        created_at,
        updated_at
      )
    `
    )
    .eq('ativo', true)
    .order('ordem')

  if (error) {
    console.error('Error fetching categories:', error)
    return []
  }

  return data as (CategoriaProduto & {
    variacoes_tipo: VariacaoTipo[]
    grupos_componentes: GrupoComponente[]
  })[]
}

/**
 * Get all available components for a specific category
 * Returns grouped by component group
 */
export async function getComponentesPorCategoria(categoria_id: string) {
  const supabase = await createAuthenticatedClient()

  const { data, error } = await supabase
    .from('componentes_estoque')
    .select(
      `
      margem_lucro,
      grupo:grupos_componentes!inner (
        id,
        nome,
        categoria_id,
        ativo
      ),
      material:materiais!inner (
        id,
        nome,
        custo_unitario,
        quantidade,
        quantidade_atual,
        imagem_url,
        ativo
      )
    `
    )
    .eq('ativo', true)
    .eq('grupo.categoria_id', categoria_id)
    .eq('grupo.ativo', true)
    .eq('material.ativo', true)

  if (error) {
    console.error('Error fetching components:', error)
    return []
  }

  return (data || []).map((item: any) => {
    const estoqueAtual = item.material.quantidade_atual ?? item.material.quantidade ?? 0
    const custoUnitario = item.material.custo_unitario ?? 0
    const margemLucro = item.margem_lucro ?? 0

    return {
      grupo_id: item.grupo.id,
      grupo_nome: item.grupo.nome,
      categoria_id: item.grupo.categoria_id,
      material_id: item.material.id,
      material_nome: item.material.nome,
      custo_unitario: custoUnitario,
      margem_lucro: margemLucro,
      preco_venda: custoUnitario * (1 + margemLucro / 100),
      estoque_atual: estoqueAtual,
      imagem_url: item.material.imagem_url,
    }
  }) as ComponenteDisponivel[]
}

/**
 * Get available components for a specific component group
 */
export async function getComponentesPorGrupo(grupo_id: string) {
  const supabase = await createAuthenticatedClient()

  const { data, error } = await supabase
    .from('componentes_estoque')
    .select(
      `
      id,
      grupo_id,
      material_id,
      margem_lucro,
      ativo,
      ordem,
      created_at,
      updated_at,
      material:materiais!inner (
        id,
        nome,
        preco_compra,
        custo_unitario,
        quantidade,
        imagem_url,
        ativo
      )
    `
    )
    .eq('grupo_id', grupo_id)
    .eq('ativo', true)
    .eq('material.ativo', true)
    .order('ordem, material->nome')

  if (error) {
    console.error('Error fetching group components:', error)
    return []
  }

  return data
}

/**
 * Validate if there's enough stock for selected components
 * Returns: { valid: boolean, messages: string[] }
 */
export async function validarEstoqueComponentes(
  componentes: Array<{
    material_id: string
    quantidade: number
  }>
): Promise<{ valid: boolean; messages: string[] }> {
  const supabase = await createAuthenticatedClient()
  const messages: string[] = []
  const demandaPorMaterial = componentes.reduce<Map<string, number>>((map, componente) => {
    map.set(
      componente.material_id,
      (map.get(componente.material_id) ?? 0) + componente.quantidade
    )
    return map
  }, new Map())
  const materialIds = Array.from(demandaPorMaterial.keys())

  if (materialIds.length === 0) {
    return { valid: true, messages }
  }

  const { data: materiais, error } = await supabase
    .from('materiais')
    .select('id, nome, quantidade, quantidade_atual')
    .in('id', materialIds)
    .eq('ativo', true)

  if (error) {
    return { valid: false, messages: ['Erro ao consultar o estoque dos materiais'] }
  }

  const materiaisPorId = new Map((materiais || []).map((material) => [material.id, material]))

  for (const [materialId, quantidade] of demandaPorMaterial) {
    const material = materiaisPorId.get(materialId)
    if (!material) {
      messages.push('Material não encontrado')
      continue
    }

    const estoque = material.quantidade_atual ?? material.quantidade ?? 0
    if (estoque < quantidade) {
      messages.push(
        `${material.nome}: apenas ${estoque} em estoque (pedindo ${quantidade})`
      )
    }
  }

  return { valid: messages.length === 0, messages }
}

/**
 * Calcula o CUSTO BASE por unidade (sem margem e sem arredondamento).
 *
 * Regra ExclusivArt (obrigatória):
 * - Cada material entra com seu custo real cadastrado.
 * - NUNCA aplicar margem por componente.
 * - NUNCA arredondar por componente ou por unidade.
 * - Margem e arredondamento (50 centavos) são aplicados SOMENTE no valor final total do pedido,
 *   depois de multiplicar pela quantidade de itens.
 *
 * Esta função retorna apenas o custo base por unidade (materiais + mão de obra).
 * A aplicação de margem + arredondamento final acontece em criarPedidoComMontagem.
 */
export async function calcularPrecoItemMontado(
  categoria_id: string,
  componentes: Array<{
    material_id: string
    quantidade: number
  }>,
  _margemPercentual: number = 100 // Ignorado de propósito - margem só no total final
): Promise<{
  total_componentes: number
  maodeobra: number
  total: number
  detalhes: Array<{
    material_nome: string
    valor_unitario: number
    quantidade: number
    subtotal: number
  }>
}> {
  const supabase = await createAuthenticatedClient()

  const { data: maodeobra_data, error: maodeobra_error } = await supabase
    .from('configuracao_maodeobra')
    .select('valor_maodeobra')
    .eq('categoria_id', categoria_id)
    .single()

  if (maodeobra_error) {
    console.error('Error fetching labor cost:', maodeobra_error)
  }

  const maodeobra = maodeobra_data?.valor_maodeobra || 0

  // Esta etapa calcula custo puro; margem e arredondamento ficam para o pedido.
  const detalhes: Array<{
    material_nome: string
    valor_unitario: number
    quantidade: number
    subtotal: number
  }> = []
  let custoMateriais = 0

  const materialIds = Array.from(
    new Set(componentes.map((componente) => componente.material_id).filter(Boolean))
  )
  const { data: materiais, error: materiaisError } = materialIds.length
    ? await supabase
        .from('materiais')
        .select('id, nome, custo_unitario')
        .in('id', materialIds)
        .eq('ativo', true)
    : { data: [], error: null }

  if (materiaisError) {
    throw new Error('Erro ao carregar custos dos materiais')
  }

  const materiaisPorId = new Map((materiais || []).map((material) => [material.id, material]))

  for (const componente of componentes) {
    const material = materiaisPorId.get(componente.material_id)
    if (!material) {
      throw new Error('Um ou mais materiais nao foram encontrados')
    }

    const custo = material.custo_unitario || 0
    const subtotal = custo * componente.quantidade

    detalhes.push({
      material_nome: material.nome,
      valor_unitario: custo,
      quantidade: componente.quantidade,
      subtotal,
    })

    custoMateriais += subtotal
  }

  const custoBaseUnitario = custoMateriais + maodeobra

  return {
    total_componentes: custoMateriais,
    maodeobra,
    total: custoBaseUnitario,
    detalhes,
  }
}

/**
 * Create a new order with custom item composition
 * This is the main function called when customer confirms their item builder selection
 */
export async function criarPedidoComMontagem(
  cliente_nome: string,
  cliente_telefone: string | null,
  cliente_endereco: string | null,
  data_entrega: string | null,
  tipo_produto_id: string,
  variacao_id: string | null,
  componentes: Array<{
    material_id: string
    quantidade: number
  }>,
  quantidade_itens: number,
  observacoes: string | null = null,
  observacao_cliente: string | null = null
) {
  const supabase = await createAuthenticatedClient()

  try {
    // Regra do atelie: multiplica o custo base pela quantidade, aplica margem
    // no total e arredonda uma unica vez no final.

    const precalizacao = await calcularPrecoItemMontado(tipo_produto_id, componentes, 100)

    const custoBaseUnitario = precalizacao.total
    const maodeobraUnitaria = precalizacao.maodeobra

    const custoBaseTotal = custoBaseUnitario * quantidade_itens

    const margemPercentual = 100
    const valorComMargem = custoBaseTotal * (1 + margemPercentual / 100)

    const valor_total = arredondarParaCimaMeioReal(valorComMargem)

    const componentes_total = componentes.map(c => ({
      ...c,
      quantidade: c.quantidade * quantidade_itens,
    }))
    const validacao = await validarEstoqueComponentes(componentes_total)

    if (!validacao.valid) {
      console.error('Stock validation failed:', validacao.messages)
      return {
        success: false,
        error: `Estoque insuficiente: ${validacao.messages.join(', ')}`,
        deve_aguardar_material: true,
      }
    }

    const produtoId = await resolveProdutoIdForCategoria(supabase, tipo_produto_id)
    if (!produtoId) {
      return {
        success: false,
        error: 'Nenhum produto cadastrado. Cadastre um produto em Produtos antes de usar o montador.',
      }
    }

    const obsParts = [observacoes, variacao_id ? `Variacao: ${variacao_id}` : null].filter(Boolean)
    const observacoesFinal = obsParts.length > 0 ? obsParts.join(' | ') : null

    const { data: pedidoId, error: pedidoError } = await supabase.rpc('criar_pedido_atomico', {
      p_pedido: {
        cliente_nome,
        cliente_contato: cliente_telefone || null,
        prazo_entrega: data_entrega || null,
        status: 'orcamento',
        observacoes: observacoesFinal,
        observacao_cliente: cleanOptionalText(observacao_cliente),
        prioridade: 1,
        tipo_produto_id,
      },
      p_itens: [
        {
          produto_id: produtoId,
          quantidade: quantidade_itens,
          valor_unitario: valor_total / quantidade_itens,
          materiais: componentes.map((componente) => ({
            material_id: componente.material_id,
            quantidade: componente.quantidade * quantidade_itens,
          })),
        },
      ],
    })

    if (pedidoError || !pedidoId) {
      logServerError('pedidos_builder_create_atomic_failed', pedidoError, {
        table: 'pedidos',
      })
      return { success: false, error: pedidoError?.message || 'Erro ao criar pedido' }
    }

    revalidatePath('/dashboard/pedidos')
    revalidatePath('/dashboard')

    return {
      success: true,
      pedidoId,
      valor_total,
    }
  } catch (error) {
    console.error('Unexpected error creating order:', error)
    return { success: false, error: 'Erro inesperado ao criar pedido' }
  }
}

/**
 * Get labor cost configuration for a category
 */
export async function getConfiguracaoMaodeobra(categoria_id: string) {
  const supabase = await createAuthenticatedClient()

  const { data, error } = await supabase
    .from('configuracao_maodeobra')
    .select('*')
    .eq('categoria_id', categoria_id)
    .single()

  if (error) {
    console.error('Error fetching labor cost:', error)
    return { valor_maodeobra: 0, descricao: null }
  }

  return data as ConfiguracaoMaodeobra
}

/**
 * Get all labor cost configurations
 */
export async function getTodasConfiguracoesMaodeobra() {
  const supabase = await createAuthenticatedClient()

  const { data, error } = await supabase
    .from('configuracao_maodeobra')
    .select(
      `
      id,
      categoria_id,
      valor_maodeobra,
      descricao,
      categoria:categorias_produtos!inner (
        id,
        nome,
        ativo
      )
    `
    )
    .eq('categoria.ativo', true)
    .order('categoria_id')

  if (error) {
    console.error('Error fetching labor costs:', error)
    return []
  }

  return data as unknown as (ConfiguracaoMaodeobra & {
    categoria: CategoriaProduto
  })[]
}

/**
 * Update labor cost for a category
 */
export async function atualizarMaodeobra(
  categoria_id: string,
  novo_valor: number
) {
  const supabase = await createAuthenticatedClient()

  if (novo_valor < 0) {
    return { success: false, error: 'Valor deve ser positivo' }
  }

  const { error } = await supabase
    .from('configuracao_maodeobra')
    .update({ valor_maodeobra: novo_valor })
    .eq('categoria_id', categoria_id)

  if (error) {
    console.error('Error updating labor cost:', error)
    return { success: false, error: error.message }
  }

  revalidatePath('/dashboard/configuracoes')
  revalidatePath('/dashboard')

  return { success: true }
}
