'use server'

import { revalidatePath } from 'next/cache'
import { parseDecimalInput } from '@/lib/number'
import { createAuthenticatedClient } from '@/lib/auth'
import { MATERIAL_TYPES } from '@/lib/material-types'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Produto, Material, ProdutoComMateriais } from '@/lib/types/database'

function normalizeKey(value: string | null | undefined) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function validateProdutoInput(nome: string, valorMaodeobra: number) {
  if (!nome.trim() || nome.length > 120) return 'Nome do produto invalido'
  if (valorMaodeobra < 0 || valorMaodeobra > 1_000_000) return 'Valor de mao de obra invalido'
  return null
}

async function syncTiposComponentesForCategoria(
  supabase: SupabaseClient,
  categoriaId: string
) {
  const tiposMap = new Map(
    MATERIAL_TYPES.map((tipo) => [
      normalizeKey(tipo.nome),
      {
        nome: tipo.nome,
        descricao: null,
        obrigatorio: false,
        permite_multipla_selecao: false,
        ordem: tipo.ordem,
      },
    ])
  )

  const { data: gruposCategoria } = await supabase
    .from('grupos_componentes')
    .select('nome')
    .eq('categoria_id', categoriaId)

  const existentes = new Set((gruposCategoria || []).map((grupo) => normalizeKey(grupo.nome)))
  const inserir = Array.from(tiposMap.values())
    .filter((tipo) => !existentes.has(normalizeKey(tipo.nome)))
    .map((tipo) => ({
      categoria_id: categoriaId,
      nome: tipo.nome,
      descricao: tipo.descricao,
      obrigatorio: tipo.obrigatorio,
      permite_multipla_selecao: tipo.permite_multipla_selecao,
      ordem: tipo.ordem,
      ativo: true,
    }))

  if (inserir.length === 0) return { success: true }

  const { error } = await supabase.from('grupos_componentes').insert(inserir)
  if (error) {
    console.error('Error syncing component groups for product category:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

async function syncProdutoComoCategoria(
  supabase: SupabaseClient,
  nome: string,
  valorMaodeobra: number
) {
  const nomeLimpo = nome.trim()
  if (!nomeLimpo) return { success: false, error: 'Nome do produto obrigatório' }

  const { data: existente } = await supabase
    .from('categorias_produtos')
    .select('id')
    .ilike('nome', nomeLimpo)
    .limit(1)
    .maybeSingle()

  let categoriaId = existente?.id

  if (categoriaId) {
    const { error } = await supabase
      .from('categorias_produtos')
      .update({
        nome: nomeLimpo,
        descricao: `Produto ${nomeLimpo}`,
        ativo: true,
      })
      .eq('id', categoriaId)

    if (error) return { success: false, error: error.message }
  } else {
    const { data: ultima } = await supabase
      .from('categorias_produtos')
      .select('ordem')
      .order('ordem', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { data: novaCategoria, error } = await supabase
      .from('categorias_produtos')
      .insert({
        nome: nomeLimpo,
        descricao: `Produto ${nomeLimpo}`,
        ativo: true,
        ordem: (ultima?.ordem ?? 0) + 1,
      })
      .select('id')
      .single()

    if (error || !novaCategoria) {
      return { success: false, error: error?.message || 'Erro ao criar tipo de produto' }
    }

    categoriaId = novaCategoria.id
  }

  const { error: maodeobraError } = await supabase.from('configuracao_maodeobra').upsert(
    {
      categoria_id: categoriaId,
      valor_maodeobra: valorMaodeobra,
      descricao: 'Valor definido no cadastro de produtos',
    },
    { onConflict: 'categoria_id' }
  )

  if (maodeobraError) {
    console.error('Error syncing labor cost:', maodeobraError)
    return { success: false, error: maodeobraError.message }
  }

  return syncTiposComponentesForCategoria(supabase, categoriaId)
}

export type ComposicaoInput = {
  material_id: string
  quantidade_usada: number
}

export type CustoProdutoCalculado = {
  custo_materiais: number
  maodeobra: number
  custo_total: number
  preco_sugerido: number
  lucro_estimado: number
  margem_real: number
  detalhes: Array<{
    material_id: string
    material_nome: string
    quantidade: number
    custo_unitario: number
    subtotal: number
  }>
}

export async function getProdutos() {
  const supabase = await createAuthenticatedClient()

  const { data, error } = await supabase
    .from('produtos')
    .select(`
      *,
      produto_materiais (
        id,
        quantidade_usada,
        material:materiais (*)
      )
    `)
    .order('nome')

  if (error) {
    console.error('Error fetching products:', error)
    return []
  }

  return data as ProdutoComMateriais[]
}

export async function getProduto(id: string) {
  const supabase = await createAuthenticatedClient()

  const { data, error } = await supabase
    .from('produtos')
    .select(`
      *,
      produto_materiais (
        id,
        quantidade_usada,
        material:materiais (*)
      )
    `)
    .eq('id', id)
    .single()

  if (error) {
    console.error('Error fetching product:', error)
    return null
  }

  return data as ProdutoComMateriais
}

export async function getMateriais() {
  const supabase = await createAuthenticatedClient()

  const { data, error } = await supabase
    .from('materiais')
    .select('*')
    .eq('ativo', true)
    .order('nome')

  if (error) {
    console.error('Error fetching materials:', error)
    return []
  }

  return data as Material[]
}

export async function calcularCustoProduto(
  composicao: ComposicaoInput[],
  valorMaodeobra: number,
  margemLucro: number,
  precoVenda?: number
): Promise<CustoProdutoCalculado> {
  const supabase = await createAuthenticatedClient()
  const detalhes: CustoProdutoCalculado['detalhes'] = []
  let custo_materiais = 0
  const validItems = composicao.filter(
    (item) => item.material_id && item.quantidade_usada > 0
  )
  const materialIds = Array.from(new Set(validItems.map((item) => item.material_id)))
  const { data: materiais, error } = materialIds.length
    ? await supabase
        .from('materiais')
        .select('id, nome, custo_unitario')
        .in('id', materialIds)
        .eq('ativo', true)
    : { data: [], error: null }

  if (error) {
    throw new Error('Erro ao carregar custos dos materiais')
  }

  const materiaisPorId = new Map((materiais || []).map((material) => [material.id, material]))
  for (const item of validItems) {
    const material = materiaisPorId.get(item.material_id)
    if (!material) continue
    const custo_unitario = material.custo_unitario ?? 0
    const subtotal = custo_unitario * item.quantidade_usada
    custo_materiais += subtotal

    detalhes.push({
      material_id: material.id,
      material_nome: material.nome,
      quantidade: item.quantidade_usada,
      custo_unitario,
      subtotal,
    })
  }

  const maodeobra = valorMaodeobra || 0
  const custo_total = custo_materiais + maodeobra
  const preco_sugerido =
    margemLucro >= 100
      ? custo_total * 2
      : custo_total / (1 - margemLucro / 100)
  const preco = precoVenda ?? preco_sugerido
  const lucro_estimado = preco - custo_total
  const margem_real = preco > 0 ? (lucro_estimado / preco) * 100 : 0

  return {
    custo_materiais,
    maodeobra,
    custo_total,
    preco_sugerido,
    lucro_estimado,
    margem_real,
    detalhes,
  }
}

async function saveComposicao(
  supabase: SupabaseClient,
  produtoId: string,
  composicao: ComposicaoInput[]
) {
  const validItems = composicao.filter(
    (item) => item.material_id && item.quantidade_usada > 0
  )

  const { error } = await supabase.rpc('substituir_composicao_produto', {
    p_produto_id: produtoId,
    p_composicao: validItems.map((item) => ({
      material_id: item.material_id,
      quantidade_usada: item.quantidade_usada,
    })),
  })

  if (error) {
    console.error('Error saving composition:', error)
    throw new Error(error.message)
  }
}

export async function createProduto(
  formData: FormData,
  composicao: ComposicaoInput[] = []
) {
  const supabase = await createAuthenticatedClient()

  const nome = formData.get('nome') as string
  const tipo = formData.get('tipo') as string
  const preco_venda = parseDecimalInput(formData.get('preco_venda'))
  const margem_lucro = parseDecimalInput(formData.get('margem_lucro')) || 30
  const valor_maodeobra = parseDecimalInput(formData.get('valor_maodeobra'))
  const validationError = validateProdutoInput(nome, valor_maodeobra)

  if (validationError) {
    return { success: false, error: validationError }
  }

  const { data: produto, error: produtoError } = await supabase
    .from('produtos')
    .insert({
      nome,
      tipo,
      preco_venda,
      margem_lucro,
      valor_maodeobra,
      ativo: true,
    })
    .select()
    .single()

  if (produtoError || !produto) {
    console.error('Error creating product:', produtoError)
    return { success: false, error: produtoError?.message || 'Erro ao criar produto' }
  }

  try {
    await saveComposicao(supabase, produto.id, composicao)
  } catch (err) {
    await supabase.from('produtos').delete().eq('id', produto.id)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro ao salvar composicao',
    }
  }

  const syncResult = await syncProdutoComoCategoria(supabase, nome, valor_maodeobra)
  if (!syncResult.success) {
    return {
      success: false,
      error: syncResult.error || 'Produto criado, mas falhou ao sincronizar tipo de pedido',
    }
  }

  revalidatePath('/dashboard/produtos')
  revalidatePath('/dashboard/pedidos')
  revalidatePath('/dashboard/configuracoes')
  return { success: true }
}

export async function updateProduto(
  id: string,
  formData: FormData,
  composicao?: ComposicaoInput[]
) {
  const supabase = await createAuthenticatedClient()

  const nome = formData.get('nome') as string
  const tipo = formData.get('tipo') as string
  const preco_venda = parseDecimalInput(formData.get('preco_venda'))
  const margem_lucro = parseDecimalInput(formData.get('margem_lucro')) || 30
  const valor_maodeobra = parseDecimalInput(formData.get('valor_maodeobra'))
  const ativo = formData.get('ativo') === 'true'
  const validationError = validateProdutoInput(nome, valor_maodeobra)

  if (validationError) {
    return { success: false, error: validationError }
  }

  const { error: produtoError } = await supabase
    .from('produtos')
    .update({
      nome,
      tipo,
      preco_venda,
      margem_lucro,
      valor_maodeobra,
      ativo,
    })
    .eq('id', id)

  if (produtoError) {
    console.error('Error updating product:', produtoError)
    return { success: false, error: produtoError.message }
  }

  if (composicao) {
    try {
      await saveComposicao(supabase, id, composicao)
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Erro ao salvar composicao',
      }
    }
  }

  const syncResult = await syncProdutoComoCategoria(supabase, nome, valor_maodeobra)
  if (!syncResult.success) {
    return {
      success: false,
      error: syncResult.error || 'Produto atualizado, mas falhou ao sincronizar tipo de pedido',
    }
  }

  revalidatePath('/dashboard/produtos')
  revalidatePath('/dashboard/pedidos')
  revalidatePath('/dashboard/configuracoes')
  return { success: true }
}

export async function duplicateProduto(id: string) {
  const produto = await getProduto(id)
  if (!produto) {
    return { success: false, error: 'Produto nao encontrado' }
  }

  const supabase = await createAuthenticatedClient()
  const { data: novo, error } = await supabase
    .from('produtos')
    .insert({
      nome: `${produto.nome} (copia)`,
      tipo: produto.tipo,
      preco_venda: produto.preco_venda,
      margem_lucro: produto.margem_lucro,
      valor_maodeobra: produto.valor_maodeobra ?? 0,
      ativo: true,
    })
    .select()
    .single()

  if (error || !novo) {
    return { success: false, error: error?.message || 'Erro ao duplicar' }
  }

  const composicao = produto.produto_materiais.map((pm) => ({
    material_id: pm.material_id,
    quantidade_usada: pm.quantidade_usada,
  }))

  try {
    await saveComposicao(supabase, novo.id, composicao)
  } catch (err) {
    await supabase.from('produtos').delete().eq('id', novo.id)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro ao copiar composicao',
    }
  }

  await syncProdutoComoCategoria(supabase, novo.nome, novo.valor_maodeobra ?? 0)

  revalidatePath('/dashboard/produtos')
  revalidatePath('/dashboard/pedidos')
  revalidatePath('/dashboard/configuracoes')
  return { success: true, produtoId: novo.id }
}

export async function deleteProduto(id: string) {
  const supabase = await createAuthenticatedClient()
  const { data: produto } = await supabase
    .from('produtos')
    .select('nome')
    .eq('id', id)
    .maybeSingle()

  const { error } = await supabase
    .from('produtos')
    .update({ ativo: false })
    .eq('id', id)

  if (error) {
    console.error('Error archiving product:', error)
    return { success: false, error: error.message }
  }

  if (produto?.nome) {
    await supabase
      .from('categorias_produtos')
      .update({ ativo: false })
      .ilike('nome', produto.nome)
  }

  revalidatePath('/dashboard/produtos')
  revalidatePath('/dashboard/pedidos')
  revalidatePath('/dashboard/configuracoes')
  return { success: true }
}

export async function toggleProdutoAtivo(id: string, ativo: boolean) {
  const supabase = await createAuthenticatedClient()

  const { error } = await supabase.from('produtos').update({ ativo }).eq('id', id)

  if (error) {
    console.error('Error toggling product:', error)
    return { success: false, error: error.message }
  }

  const { data: produto } = await supabase
    .from('produtos')
    .select('nome')
    .eq('id', id)
    .maybeSingle()

  if (produto?.nome) {
    await supabase
      .from('categorias_produtos')
      .update({ ativo })
      .ilike('nome', produto.nome)
  }

  revalidatePath('/dashboard/produtos')
  revalidatePath('/dashboard/pedidos')
  revalidatePath('/dashboard/configuracoes')
  return { success: true }
}

export async function getComposicaoProduto(produtoId: string): Promise<ComposicaoInput[]> {
  const supabase = await createAuthenticatedClient()

  const { data, error } = await supabase
    .from('produto_materiais')
    .select('material_id, quantidade_usada')
    .eq('produto_id', produtoId)

  if (error || !data) return []

  return data.map((row) => ({
    material_id: row.material_id,
    quantidade_usada: row.quantidade_usada,
  }))
}
