'use server'

import { revalidatePath } from 'next/cache'
import { areDecimalValuesClose, parseDecimalInput, roundCurrency } from '@/lib/number'
import { createAuthenticatedClient } from '@/lib/auth'
import { getCanonicalMaterialType } from '@/lib/material-types'
import { logServerError } from '@/lib/server-log'
import type { Material, TipoMovimentacao } from '@/lib/types/database'

const MAX_IMAGE_SIZE = 5 * 1024 * 1024
type ImageUploadResult = { url: string | null; error?: string }

async function getSafeImageExtension(file: File) {
  if (file.size > MAX_IMAGE_SIZE) {
    throw new Error('Imagem maior que 5MB')
  }

  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())

  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (isJpeg) return 'jpg'

  const isPng =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  if (isPng) return 'png'

  const isWebp =
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  if (isWebp) return 'webp'

  throw new Error('Use apenas imagens JPG, PNG ou WEBP')
}

function getImageContentType(file: File, fileExt: string) {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
  if (allowedTypes.includes(file.type)) {
    return file.type
  }

  const fallbackTypes: Record<string, string> = {
    jpg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  }

  return fallbackTypes[fileExt] ?? 'image/jpeg'
}

async function validatePublicImageUrl(publicUrl: string) {
  try {
    const response = await fetch(publicUrl, {
      method: 'HEAD',
      cache: 'no-store',
      })

    if (response.ok) {
      return null
    }

    return `Imagem enviada, mas a URL publica nao abriu (${response.status}). Verifique as permissoes do bucket.`
  } catch {
    return 'Imagem enviada, mas nao foi possivel validar a URL publica do Storage.'
  }
}

function validateMaterialFields(nome: string, tipo: string, quantidade: number, custoUnitario: number) {
  if (!nome.trim() || nome.length > 120) return 'Nome do material invalido'
  if (!tipo.trim() || tipo.length > 60) return 'Tipo de componente invalido'
  if (quantidade < 0 || quantidade > 1_000_000) return 'Quantidade invalida'
  if (custoUnitario < 0 || custoUnitario > 1_000_000) return 'Custo unitario invalido'
  return null
}

function toFiniteNumber(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }

  if (typeof value === 'string') {
    return parseDecimalInput(value)
  }

  return 0
}

function getSafeImageUrl(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') return { url: null, error: null }

  const rawUrl = value.trim()
  if (!rawUrl) return { url: null, error: null }
  if (rawUrl.length > 2048) return { url: null, error: 'URL da imagem muito longa' }
  if (/[\u0000-\u001F\u007F]/.test(rawUrl)) return { url: null, error: 'URL da imagem invalida' }

  try {
    if (rawUrl.startsWith('/') && !rawUrl.startsWith('//')) {
      if (/\.svg(?:$|[?#])/i.test(rawUrl)) {
        return { url: null, error: 'Use imagens JPG, PNG ou WEBP' }
      }
      return { url: rawUrl, error: null }
    }

    const url = new URL(rawUrl)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return { url: null, error: 'URL da imagem deve usar http ou https' }
    }
    if (/\.svg(?:$|[?#])/i.test(url.pathname)) {
      return { url: null, error: 'Use imagens JPG, PNG ou WEBP' }
    }

    return { url: url.toString(), error: null }
  } catch {
    return { url: null, error: 'URL da imagem invalida' }
  }
}

export async function getMateriais() {
  const supabase = await createAuthenticatedClient()

  try {
    const { data, error } = await supabase
      .from('materiais')
      .select('*')
      .eq('ativo', true)
      .order('nome')

    if (error) {
      logServerError('estoque_get_materiais_failed', error, { table: 'materiais' })
      return []
    }

    return data as Material[]
  } catch (error) {
    logServerError('estoque_get_materiais_exception', error, { table: 'materiais' })
    return []
  }
}

export async function getMaterial(id: string) {
  const supabase = await createAuthenticatedClient()

  try {
    const { data, error } = await supabase
      .from('materiais')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      logServerError('estoque_get_material_failed', error, { table: 'materiais' })
      return null
    }

    return data as Material
  } catch (error) {
    logServerError('estoque_get_material_exception', error, { table: 'materiais' })
    return null
  }
}

export async function uploadImagemMaterial(file: File): Promise<ImageUploadResult> {
  const supabase = await createAuthenticatedClient()

  const fileExt = await getSafeImageExtension(file)
  const fileName = `${crypto.randomUUID()}-${Date.now()}.${fileExt}`
  const filePath = `materiais/${fileName}`
  const contentType = getImageContentType(file, fileExt)

  try {
    const { error } = await supabase.storage
      .from('imagens-estoque')
      .upload(filePath, file, {
        upsert: false,
        contentType,
        cacheControl: '31536000',
    })

    if (error) {
      logServerError('estoque_upload_imagem_failed', error, {
        bucket: 'imagens-estoque',
        fileSize: file.size,
        contentType,
      })
      return {
        url: null,
        error: `Falha ao enviar imagem para o Storage: ${error.message}`,
      }
    }

    const { data: publicUrl } = supabase.storage
      .from('imagens-estoque')
      .getPublicUrl(filePath)

    if (!publicUrl.publicUrl) {
      return { url: null, error: 'Storage nao retornou uma URL publica para a imagem.' }
    }

    const publicUrlError = await validatePublicImageUrl(publicUrl.publicUrl)
    if (publicUrlError) {
      return { url: null, error: publicUrlError }
    }

    return { url: publicUrl.publicUrl }
  } catch (error) {
    logServerError('estoque_upload_imagem_exception', error, {
      bucket: 'imagens-estoque',
      fileSize: file.size,
    })
    return {
      url: null,
      error: error instanceof Error ? error.message : 'Erro ao enviar imagem',
    }
  }
}

export async function createMaterial(formData: FormData) {
  const supabase = await createAuthenticatedClient()

  const nome = formData.get('nome') as string
  const tipo = getCanonicalMaterialType(formData.get('tipo') as string)
  const unidade = formData.get('unidade') as string
  const cor = formData.get('cor') as string
  const quantidade = parseDecimalInput(formData.get('quantidade'))
  const quantidade_minima = parseDecimalInput(formData.get('quantidade_minima')) || 30
  const custo_unitario_input = parseDecimalInput(formData.get('custo_unitario'))
  const preco_compra_input = parseDecimalInput(formData.get('preco_compra'))
  const imagem = formData.get('imagem') as File | null
  const imagemUrlResult = getSafeImageUrl(formData.get('imagem_url'))
  const validationError = tipo
    ? validateMaterialFields(nome, tipo, quantidade, custo_unitario_input)
    : 'Tipo de componente invalido'

  if (validationError) {
    return { success: false, error: validationError }
  }
  if (imagemUrlResult.error) {
    return { success: false, error: imagemUrlResult.error }
  }

  let imagem_url = imagemUrlResult.url
  if (imagem && imagem.size > 0) {
    try {
      const uploadResult = await uploadImagemMaterial(imagem)
      if (uploadResult.error) {
        return { success: false, error: uploadResult.error }
      }
      imagem_url = uploadResult.url || imagem_url
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Imagem invalida',
      }
    }
  }

  // O cadastro trabalha com custo unitario; preco_compra guarda o custo total inicial.
  const preco_compra = roundCurrency(
    custo_unitario_input > 0 ? custo_unitario_input * quantidade : preco_compra_input
  )

  const insertData: Record<string, unknown> = {
    nome,
    tipo,
    unidade,
    cor,
    quantidade,
    quantidade_atual: quantidade,
    quantidade_minima,
    preco_compra,
  }

  // Evita tocar em imagem_url sem imagem nova. Em deploy recente, o PostgREST
  // pode demorar alguns minutos para enxergar a coluna criada por migration.
  if (imagem_url) {
    insertData.imagem_url = imagem_url
  }

  const { data: material, error } = await supabase
    .from('materiais')
    .insert(insertData)
    .select('*')
    .single()

  if (error || !material) {
    logServerError('estoque_create_material_failed', error, {
      table: 'materiais',
      hasImage: Boolean(imagem_url),
    })
    return { success: false, error: error?.message || 'Erro ao cadastrar material' }
  }

  revalidatePath('/dashboard/estoque')
  revalidatePath('/dashboard/pedidos')
  return { success: true, material: material as Material }
}

export async function updateMaterial(materialId: string, formData: FormData) {
  const supabase = await createAuthenticatedClient()

  const nome = formData.get('nome') as string
  const tipo = getCanonicalMaterialType(formData.get('tipo') as string)
  const unidade = formData.get('unidade') as string
  const cor = formData.get('cor') as string
  const novaQuantidadeAtual = parseDecimalInput(formData.get('quantidade_atual'))
  const quantidade_minima = parseDecimalInput(formData.get('quantidade_minima')) || 30
  const custo_unitario_input = parseDecimalInput(formData.get('custo_unitario'))
  const preco_compra_input = parseDecimalInput(formData.get('preco_compra'))
  const imagem = formData.get('imagem') as File | null
  const imagemUrlResult = getSafeImageUrl(formData.get('imagem_url'))

  if (imagemUrlResult.error) {
    return { success: false, error: imagemUrlResult.error }
  }

  const { data: materialAtual, error: materialAtualError } = await supabase
    .from('materiais')
    .select('preco_compra, quantidade, quantidade_atual, custo_unitario')
    .eq('id', materialId)
    .single()

  if (materialAtualError || !materialAtual) {
    logServerError('estoque_update_material_fetch_failed', materialAtualError, {
      table: 'materiais',
    })
    return { success: false, error: 'Material nao encontrado' }
  }

  let imagem_url: string | null | undefined = imagemUrlResult.url
  if (imagem && imagem.size > 0) {
    try {
      const uploadResult = await uploadImagemMaterial(imagem)
      if (uploadResult.error) {
        return { success: false, error: uploadResult.error }
      }
      imagem_url = uploadResult.url || imagem_url
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Imagem invalida',
      }
    }
  }

  const quantidadeBaseAtual = toFiniteNumber(materialAtual.quantidade)
  const estoqueAtual = toFiniteNumber(materialAtual.quantidade_atual ?? materialAtual.quantidade)
  const quantidadeBase = quantidadeBaseAtual > 0 ? quantidadeBaseAtual : estoqueAtual
  const custoUnitarioAtual = toFiniteNumber(materialAtual.custo_unitario)
  const precoCompraAtual = roundCurrency(toFiniteNumber(materialAtual.preco_compra))
  const validationError = tipo
    ? validateMaterialFields(nome, tipo, quantidadeBase, custo_unitario_input)
    : 'Tipo de componente invalido'

  if (validationError) {
    return { success: false, error: validationError }
  }

  if (novaQuantidadeAtual < 0 || novaQuantidadeAtual > 1_000_000) {
    return { success: false, error: 'Estoque atual invalido' }
  }

  const custoUnitarioAlterado =
    custo_unitario_input > 0 &&
    !areDecimalValuesClose(custo_unitario_input, custoUnitarioAtual, 4)

  const preco_compra = custoUnitarioAlterado
    ? roundCurrency(custo_unitario_input * quantidadeBase)
    : preco_compra_input > 0 && custo_unitario_input <= 0
      ? roundCurrency(preco_compra_input)
      : precoCompraAtual

  const { error } = await supabase.rpc('atualizar_material_com_estoque', {
    p_material_id: materialId,
    p_nome: nome,
    p_tipo: tipo,
    p_unidade: unidade,
    p_cor: cor,
    p_quantidade_base: quantidadeBase,
    p_quantidade_minima: quantidade_minima,
    p_preco_compra: preco_compra,
    p_imagem_url: imagem_url,
    p_nova_quantidade: novaQuantidadeAtual,
  })

  if (error) {
    logServerError('estoque_update_material_atomic_failed', error, {
      table: 'materiais',
      hasImage: Boolean(imagem_url),
    })
    return { success: false, error: error.message }
  }

  revalidatePath('/dashboard/estoque')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function deleteMaterial(materialId: string) {
  const supabase = await createAuthenticatedClient()

  const { data: action, error } = await supabase.rpc('excluir_ou_arquivar_material', {
    p_material_id: materialId,
  })

  if (error) {
    logServerError('estoque_delete_material_failed', error, { table: 'materiais' })
    return { success: false, error: error.message }
  }

  revalidatePath('/dashboard/estoque')
  revalidatePath('/dashboard/produtos')
  revalidatePath('/dashboard/pedidos')
  revalidatePath('/dashboard/operacao')
  revalidatePath('/dashboard')
  return {
    success: true,
    action: action === 'arquivado' ? ('arquivado' as const) : ('excluido' as const),
  }
}

export async function registrarMovimentacao(
  materialId: string,
  tipo: TipoMovimentacao,
  quantidade: number,
  motivo?: string
) {
  const supabase = await createAuthenticatedClient()

  const { error } = await supabase.rpc('registrar_movimentacao_material', {
    p_material_id: materialId,
    p_tipo: tipo,
    p_quantidade: quantidade,
    p_motivo: motivo || null,
  })

  if (error) {
    logServerError('estoque_registrar_movimentacao_failed', error, {
      table: 'movimentacoes_estoque',
      tipo,
    })
    return { success: false, error: error.message }
  }

  revalidatePath('/dashboard/estoque')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function getMovimentacoes(materialId: string) {
  const supabase = await createAuthenticatedClient()

  try {
    const { data, error } = await supabase
      .from('movimentacoes_estoque')
      .select('*')
      .eq('material_id', materialId)
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      logServerError('estoque_get_movimentacoes_failed', error, {
        table: 'movimentacoes_estoque',
      })
      return []
    }

    return data
  } catch (error) {
    logServerError('estoque_get_movimentacoes_exception', error, {
      table: 'movimentacoes_estoque',
    })
    return []
  }
}
