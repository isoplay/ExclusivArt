'use server'

import { revalidatePath } from 'next/cache'
import { parseDecimalInput } from '@/lib/number'
import { createAuthenticatedClient } from '@/lib/auth'
import { getCanonicalMaterialType, MATERIAL_TYPES } from '@/lib/material-types'
import { logServerError } from '@/lib/server-log'
import {
  isFiniteNumberInRange,
  isValidUuid,
  normalizeSingleLine,
} from '@/lib/security/input'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Produto, Material, ProdutoComMateriais } from '@/lib/types/database'

function normalizeKey(value: string | null | undefined) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

const MAX_COMPOSICAO_ITEMS = 100

type TipoComponenteSync = {
  nome: string
  descricao: null
  obrigatorio: false
  permite_multipla_selecao: false
  ordem: number
}

function validateProdutoInput(
  nome: string,
  tipo: string,
  precoVenda: number,
  margemLucro: number,
  valorMaodeobra: number
) {
  if (!nome.trim() || nome.length > 120) return 'Nome do produto invalido'
  if (!tipo.trim() || tipo.length > 60) return 'Tipo do produto invalido'
  if (!isFiniteNumberInRange(precoVenda, 0, 1_000_000_000)) return 'Preco invalido'
  if (!isFiniteNumberInRange(margemLucro, 0, 100_000)) return 'Margem invalida'
  if (!isFiniteNumberInRange(valorMaodeobra, 0, 1_000_000)) {
    return 'Valor de mao de obra invalido'
  }
  return null
}

function isValidComposicao(composicao: ComposicaoInput[]) {
  return (
    Array.isArray(composicao) &&
    composicao.length <= MAX_COMPOSICAO_ITEMS &&
    composicao.every(
      (item) =>
        isValidUuid(item.material_id) &&
        isFiniteNumberInRange(item.quantidade_usada, 0.001, 100_000)
    )
  )
}

async function syncTiposComponentesForCategoria(
  supabase: SupabaseClient,
  categoriaId: string
) {
  const tipos = await getTiposComponentesParaSincronizar(supabase)
  const tiposMap = new Map(tipos.map((tipo) => [normalizeKey(tipo.nome), tipo]))

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
    logServerError('produtos_sync_component_groups_failed', error, {
      table: 'grupos_componentes',
    })
    return { success: false, error: 'Nao foi possivel sincronizar os componentes' }
  }

  return { success: true }
}

async function getTiposComponentesParaSincronizar(
  supabase: SupabaseClient
): Promise<TipoComponenteSync[]> {
  const tiposMap = new Map<string, TipoComponenteSync>(
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

  const [gruposResult, materiaisResult] = await Promise.all([
    supabase
      .from('grupos_componentes')
      .select('nome, ordem')
      .eq('ativo', true)
      .order('ordem'),
    supabase
      .from('materiais')
      .select('tipo')
      .eq('ativo', true),
  ])

  if (gruposResult.error) {
    logServerError('produtos_sync_component_types_groups_failed', gruposResult.error, {
      table: 'grupos_componentes',
    })
  }

  if (materiaisResult.error) {
    logServerError('produtos_sync_component_types_materials_failed', materiaisResult.error, {
      table: 'materiais',
    })
  }

  for (const grupo of gruposResult.data || []) {
    const nome = getCanonicalMaterialType(grupo.nome)
    if (!nome) continue

    const key = normalizeKey(nome)
    const atual = tiposMap.get(key)
    tiposMap.set(key, {
      nome,
      descricao: null,
      obrigatorio: false,
      permite_multipla_selecao: false,
      ordem: Math.min(atual?.ordem ?? 999, grupo.ordem ?? 999),
    })
  }

  for (const material of materiaisResult.data || []) {
    const nome = getCanonicalMaterialType(material.tipo)
    if (!nome) continue

    const key = normalizeKey(nome)
    if (!tiposMap.has(key)) {
      tiposMap.set(key, {
        nome,
        descricao: null,
        obrigatorio: false,
        permite_multipla_selecao: false,
        ordem: 999,
      })
    }
  }

  return Array.from(tiposMap.values()).sort((a, b) => {
    if (a.ordem !== b.ordem) return a.ordem - b.ordem
    return a.nome.localeCompare(b.nome, 'pt-BR')
  })
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

    if (error) {
      logServerError('produtos_sync_category_failed', error, {
        table: 'categorias_produtos',
      })
      return { success: false, error: 'Nao foi possivel sincronizar o tipo de produto' }
    }
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
      logServerError('produtos_create_category_failed', error, {
        table: 'categorias_produtos',
      })
      return { success: false, error: 'Nao foi possivel criar o tipo de produto' }
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
    logServerError('produtos_sync_labor_failed', maodeobraError, {
      table: 'configuracao_maodeobra',
    })
    return { success: false, error: 'Nao foi possivel sincronizar a mao de obra' }
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
    .limit(500)

  if (error) {
    logServerError('produtos_list_failed', error, { table: 'produtos' })
    return []
  }

  return data as ProdutoComMateriais[]
}

export async function getProduto(id: string) {
  if (!isValidUuid(id)) return null

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
    logServerError('produtos_get_failed', error, { table: 'produtos' })
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
    .limit(1000)

  if (error) {
    logServerError('produtos_materials_failed', error, { table: 'materiais' })
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
  if (
    !isValidComposicao(composicao) ||
    !isFiniteNumberInRange(valorMaodeobra, 0, 1_000_000) ||
    !isFiniteNumberInRange(margemLucro, 0, 100_000) ||
    (precoVenda !== undefined && !isFiniteNumberInRange(precoVenda, 0, 1_000_000_000))
  ) {
    throw new Error('Dados de custo invalidos')
  }

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
  if (!isValidUuid(produtoId) || !isValidComposicao(composicao)) {
    throw new Error('Composicao invalida')
  }

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
    logServerError('produtos_save_composition_failed', error, {
      table: 'produto_materiais',
    })
    throw new Error('Nao foi possivel salvar a composicao')
  }
}

export async function createProduto(
  formData: FormData,
  composicao: ComposicaoInput[] = []
) {
  const supabase = await createAuthenticatedClient()

  const nome = normalizeSingleLine(formData.get('nome'), 120) ?? ''
  const tipo = normalizeSingleLine(formData.get('tipo'), 60) ?? ''
  const preco_venda = parseDecimalInput(formData.get('preco_venda'))
  const margem_lucro = parseDecimalInput(formData.get('margem_lucro')) || 30
  const valor_maodeobra = parseDecimalInput(formData.get('valor_maodeobra'))
  const validationError = validateProdutoInput(
    nome,
    tipo,
    preco_venda,
    margem_lucro,
    valor_maodeobra
  )

  if (validationError || !isValidComposicao(composicao)) {
    return { success: false, error: validationError || 'Composicao invalida' }
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
    logServerError('produtos_create_failed', produtoError, { table: 'produtos' })
    return { success: false, error: 'Nao foi possivel criar o produto' }
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
  if (!isValidUuid(id)) {
    return { success: false, error: 'Produto invalido' }
  }

  const supabase = await createAuthenticatedClient()

  const nome = normalizeSingleLine(formData.get('nome'), 120) ?? ''
  const tipo = normalizeSingleLine(formData.get('tipo'), 60) ?? ''
  const preco_venda = parseDecimalInput(formData.get('preco_venda'))
  const margem_lucro = parseDecimalInput(formData.get('margem_lucro')) || 30
  const valor_maodeobra = parseDecimalInput(formData.get('valor_maodeobra'))
  const ativo = formData.get('ativo') === 'true'
  const validationError = validateProdutoInput(
    nome,
    tipo,
    preco_venda,
    margem_lucro,
    valor_maodeobra
  )

  if (validationError || (composicao !== undefined && !isValidComposicao(composicao))) {
    return { success: false, error: validationError || 'Composicao invalida' }
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
    logServerError('produtos_update_failed', produtoError, { table: 'produtos' })
    return { success: false, error: 'Nao foi possivel atualizar o produto' }
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
  if (!isValidUuid(id)) {
    return { success: false, error: 'Produto invalido' }
  }

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
    logServerError('produtos_duplicate_failed', error, { table: 'produtos' })
    return { success: false, error: 'Nao foi possivel duplicar o produto' }
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
  if (!isValidUuid(id)) {
    return { success: false, error: 'Produto invalido' }
  }

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
    logServerError('produtos_archive_failed', error, { table: 'produtos' })
    return { success: false, error: 'Nao foi possivel arquivar o produto' }
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
  if (!isValidUuid(id) || typeof ativo !== 'boolean') {
    return { success: false, error: 'Produto invalido' }
  }

  const supabase = await createAuthenticatedClient()

  const { error } = await supabase.from('produtos').update({ ativo }).eq('id', id)

  if (error) {
    logServerError('produtos_toggle_failed', error, { table: 'produtos' })
    return { success: false, error: 'Nao foi possivel alterar o produto' }
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
  if (!isValidUuid(produtoId)) return []

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
