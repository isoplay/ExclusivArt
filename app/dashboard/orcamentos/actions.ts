'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAuthenticatedClient } from '@/lib/auth'
import { logServerError } from '@/lib/server-log'
import type {
  OrcamentoComItens,
  OrigemComponenteOrcamento,
  StatusOrcamento,
} from '@/lib/types/database'
import {
  canTransitionOrcamentoStatus,
  parseOrcamentoPayload,
  type NormalizedOrcamentoPayload,
  type OrcamentoComponenteInput,
  type OrcamentoItemInput,
  type OrcamentoPayload,
  type OrcamentoUpdatePayload,
} from '@/lib/orcamentos/validation'
import { arredondarParaCimaMeioReal } from '@/lib/utils'

export type {
  OrcamentoComponenteInput,
  OrcamentoItemInput,
  OrcamentoPayload,
  OrcamentoUpdatePayload,
} from '@/lib/orcamentos/validation'

const ORCAMENTO_PATH = '/dashboard/orcamentos'
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const statusPermitidos: readonly StatusOrcamento[] = [
  'rascunho',
  'enviado',
  'aprovado',
  'recusado',
  'convertido',
  'cancelado',
]

type NormalizedComponent = Required<
  Omit<
    OrcamentoComponenteInput,
    'grupo_id' | 'material_id' | 'cor_hex' | 'imagem_url' | 'observacao'
  >
> & {
  grupo_id: string | null
  material_id: string | null
  cor_hex: string | null
  imagem_url: string | null
  observacao: string | null
}

type CalculatedItem = {
  categoria_id: string | null
  nome_produto: string
  quantidade: number
  custo_unitario: number
  mao_obra_unitaria: number
  valor_unitario: number
  valor_total: number
  ordem: number
  componentes: NormalizedComponent[]
}

type CalculatedPayload = {
  cliente_nome: string
  cliente_contato: string | null
  cliente_endereco: string | null
  validade: string | null
  prazo_estimado: string | null
  margem_percentual: number
  observacao_cliente: string | null
  observacoes_internas: string | null
  quantidade_total: number
  custo_total: number
  valor_total: number
  itens: CalculatedItem[]
}

type ValidationResult =
  | { success: true; payload: CalculatedPayload }
  | { success: false; error: string }

type PreparedPayloadResult =
  | { success: true; payload: NormalizedOrcamentoPayload }
  | { success: false; error: string }

function cleanRequiredText(value: unknown, maxLength: number) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, maxLength)
}

function cleanOptionalText(value: unknown, maxLength = 1200) {
  const text = cleanRequiredText(value, maxLength)
  return text || null
}

function exceedsTextLimit(value: unknown, maxLength: number) {
  return typeof value === 'string' && value.trim().length > maxLength
}

function toNonNegativeNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function roundQuantity(value: number) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000
}

function isValidOptionalUuid(value: string | null) {
  return value === null || uuidRegex.test(value)
}

function normalizeDate(value: unknown) {
  const date = cleanOptionalText(value, 10)
  if (!date) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return undefined
  }
  const [year, month, day] = date.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (parsed.toISOString().slice(0, 10) !== date) return undefined
  return date
}

function calculatePayload(payload: NormalizedOrcamentoPayload): ValidationResult {
  const clienteNome = cleanRequiredText(payload.cliente_nome, 120)
  if (!clienteNome) {
    return { success: false, error: 'Nome do cliente invalido' }
  }

  if (!Array.isArray(payload.itens) || payload.itens.length === 0 || payload.itens.length > 100) {
    return { success: false, error: 'Informe ao menos um item valido' }
  }

  const margemPercentual = toNonNegativeNumber(payload.margem_percentual ?? 100)
  if (margemPercentual === null || margemPercentual > 100000) {
    return { success: false, error: 'Margem percentual invalida' }
  }

  const validade = normalizeDate(payload.validade)
  const prazoEstimado = normalizeDate(payload.prazo_estimado)
  if (validade === undefined || prazoEstimado === undefined) {
    return { success: false, error: 'Data do orcamento invalida' }
  }

  const itensBase: Array<Omit<CalculatedItem, 'valor_unitario' | 'valor_total'> & {
    custoBaseTotal: number
  }> = []

  for (let itemIndex = 0; itemIndex < payload.itens.length; itemIndex++) {
    const item = payload.itens[itemIndex]
    const nomeProduto = cleanRequiredText(item.nome_produto, 160)
    const quantidade = Number(item.quantidade)
    const maoObra = toNonNegativeNumber(item.mao_obra_unitaria)
    const categoriaId = cleanOptionalText(item.categoria_id, 36)

    if (!nomeProduto) {
      return { success: false, error: `Nome invalido no item ${itemIndex + 1}` }
    }
    if (!Number.isInteger(quantidade) || quantidade <= 0 || quantidade > 100000) {
      return { success: false, error: `Quantidade invalida no item ${itemIndex + 1}` }
    }
    if (maoObra === null || maoObra > 9999999999) {
      return { success: false, error: `Mao de obra invalida no item ${itemIndex + 1}` }
    }
    if (!isValidOptionalUuid(categoriaId)) {
      return { success: false, error: `Categoria invalida no item ${itemIndex + 1}` }
    }
    if (!Array.isArray(item.componentes) || item.componentes.length > 300) {
      return { success: false, error: `Componentes invalidos no item ${itemIndex + 1}` }
    }

    const componentes: NormalizedComponent[] = []
    let custoMateriaisUnitario = 0

    for (let componentIndex = 0; componentIndex < item.componentes.length; componentIndex++) {
      const componente = item.componentes[componentIndex]
      const grupoId = cleanOptionalText(componente.grupo_id, 36)
      const materialId = cleanOptionalText(componente.material_id, 36)
      const grupoNome = cleanRequiredText(componente.grupo_nome, 120)
      const materialNome = cleanRequiredText(componente.material_nome, 160)
      const quantidadePorItem = Number(componente.quantidade_por_item)
      const custoUnitarioEstimado = toNonNegativeNumber(componente.custo_unitario_estimado)
      const origem = componente.origem

      if (!grupoNome || !materialNome) {
        return {
          success: false,
          error: `Componente invalido no item ${itemIndex + 1}`,
        }
      }
      if (!isValidOptionalUuid(grupoId) || !isValidOptionalUuid(materialId)) {
        return {
          success: false,
          error: `Vinculo invalido no componente ${componentIndex + 1}`,
        }
      }
      if (origem !== 'manual' && origem !== 'estoque') {
        return {
          success: false,
          error: `Origem invalida no componente ${componentIndex + 1}`,
        }
      }
      if (origem === 'estoque' && !materialId) {
        return {
          success: false,
          error: `Material do estoque ausente no componente ${componentIndex + 1}`,
        }
      }
      if (!Number.isFinite(quantidadePorItem) || quantidadePorItem <= 0 || quantidadePorItem > 999999999) {
        return {
          success: false,
          error: `Quantidade invalida no componente ${componentIndex + 1}`,
        }
      }
      if (custoUnitarioEstimado === null || custoUnitarioEstimado > 9999999999) {
        return {
          success: false,
          error: `Custo invalido no componente ${componentIndex + 1}`,
        }
      }

      const normalizedQuantity = roundQuantity(quantidadePorItem)
      const normalizedCost = roundMoney(custoUnitarioEstimado)
      if (normalizedQuantity <= 0) {
        return {
          success: false,
          error: `Quantidade precisa ter ao menos 0,001 no componente ${componentIndex + 1}`,
        }
      }
      custoMateriaisUnitario += normalizedQuantity * normalizedCost
      componentes.push({
        grupo_id: grupoId,
        grupo_nome: grupoNome,
        material_id: materialId,
        material_nome: materialNome,
        quantidade_por_item: normalizedQuantity,
        unidade: cleanRequiredText(componente.unidade || 'un', 20) || 'un',
        custo_unitario_estimado: normalizedCost,
        cor_hex: cleanOptionalText(componente.cor_hex, 20),
        imagem_url: cleanOptionalText(componente.imagem_url, 1000),
        origem,
        observacao: cleanOptionalText(componente.observacao, 500),
        ordem: componentIndex,
      })
    }

    const custoUnitario = roundMoney(custoMateriaisUnitario)
    const maoObraUnitaria = roundMoney(maoObra)
    const custoBaseTotal = (custoUnitario + maoObraUnitaria) * quantidade
    if (custoUnitario > 9_999_999_999 || custoBaseTotal > 9_999_999_999) {
      return { success: false, error: `Custo excede o limite no item ${itemIndex + 1}` }
    }
    itensBase.push({
      categoria_id: categoriaId,
      nome_produto: nomeProduto,
      quantidade,
      custo_unitario: custoUnitario,
      mao_obra_unitaria: maoObraUnitaria,
      ordem: itemIndex,
      componentes,
      custoBaseTotal,
    })
  }

  const custoTotalExato = itensBase.reduce((total, item) => total + item.custoBaseTotal, 0)
  const custoTotal = roundMoney(custoTotalExato)
  const valorTotal = roundMoney(
    arredondarParaCimaMeioReal(custoTotalExato * (1 + margemPercentual / 100))
  )
  if (custoTotal > 9_999_999_999 || valorTotal > 9_999_999_999) {
    return { success: false, error: 'Totais do orcamento excedem o limite permitido' }
  }

  const valorBrutoTotal = custoTotalExato * (1 + margemPercentual / 100)
  let valorDistribuido = 0
  const itens: CalculatedItem[] = itensBase.map((item, index) => {
    const isLast = index === itensBase.length - 1
    const valorBruto = item.custoBaseTotal * (1 + margemPercentual / 100)
    const valorItem = isLast
      ? roundMoney(valorTotal - valorDistribuido)
      : Math.floor(
          ((valorBrutoTotal > 0 ? (valorBruto / valorBrutoTotal) * valorTotal : 0) +
            Number.EPSILON) *
            100
        ) / 100

    valorDistribuido = roundMoney(valorDistribuido + valorItem)
    const { custoBaseTotal: _, ...itemCalculado } = item
    const valorUnitario = roundMoney(valorItem / item.quantidade)
    return {
      ...itemCalculado,
      valor_unitario: valorUnitario,
      valor_total: valorItem,
    }
  })

  return {
    success: true,
    payload: {
      cliente_nome: clienteNome,
      cliente_contato: cleanOptionalText(payload.cliente_contato, 80),
      cliente_endereco: cleanOptionalText(payload.cliente_endereco, 500),
      validade,
      prazo_estimado: prazoEstimado,
      margem_percentual: roundMoney(margemPercentual),
      observacao_cliente: cleanOptionalText(payload.observacao_cliente),
      observacoes_internas: cleanOptionalText(payload.observacoes_internas, 3000),
      quantidade_total: itens.reduce((total, item) => total + item.quantidade, 0),
      custo_total: custoTotal,
      valor_total: valorTotal,
      itens,
    },
  }
}

async function canonicalizeStockComponents(
  supabase: SupabaseClient,
  payload: NormalizedOrcamentoPayload
): Promise<PreparedPayloadResult> {
  const stockMaterialIds = Array.from(
    new Set(
      payload.itens.flatMap((item) =>
        item.componentes
          .filter((component) => component.origem === 'estoque')
          .map((component) => component.material_id)
          .filter((id): id is string => Boolean(id))
      )
    )
  )
  const groupIds = Array.from(
    new Set(
      payload.itens
        .flatMap((item) => item.componentes.map((component) => component.grupo_id))
        .filter((id): id is string => Boolean(id))
    )
  )

  const [materialsResult, groupsResult] = await Promise.all([
    stockMaterialIds.length
      ? supabase
          .from('materiais')
          .select('id, nome, custo_unitario, unidade, cor, imagem_url')
          .in('id', stockMaterialIds)
          .eq('ativo', true)
      : Promise.resolve({ data: [], error: null }),
    groupIds.length
      ? supabase
          .from('grupos_componentes')
          .select('id, nome')
          .in('id', groupIds)
          .eq('ativo', true)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (materialsResult.error || groupsResult.error) {
    logServerError(
      'orcamentos_catalog_resolve_failed',
      materialsResult.error || groupsResult.error,
      { table: materialsResult.error ? 'materiais' : 'grupos_componentes' }
    )
    return { success: false, error: 'Não foi possível validar os componentes selecionados' }
  }

  const materialsById = new Map(
    (materialsResult.data || []).map((material) => [material.id, material])
  )
  const groupsById = new Map((groupsResult.data || []).map((group) => [group.id, group]))

  for (const item of payload.itens) {
    for (const component of item.componentes) {
      if (component.grupo_id && !groupsById.has(component.grupo_id)) {
        return { success: false, error: 'Um grupo selecionado não está mais disponível' }
      }

      if (component.origem === 'manual') {
        component.material_id = null
        component.imagem_url = null
        if (component.grupo_id) {
          component.grupo_nome = groupsById.get(component.grupo_id)?.nome || component.grupo_nome
        }
        continue
      }

      const material = component.material_id
        ? materialsById.get(component.material_id)
        : null
      if (!material) {
        return { success: false, error: 'Um material selecionado não está mais disponível' }
      }

      component.material_nome = material.nome
      component.custo_unitario_estimado = Number(material.custo_unitario || 0)
      component.unidade = material.unidade || 'un'
      component.cor_hex = material.cor || null
      component.imagem_url = material.imagem_url || null
      if (component.grupo_id) {
        component.grupo_nome = groupsById.get(component.grupo_id)?.nome || component.grupo_nome
      }
    }
  }

  return { success: true, payload }
}

async function prepareCalculatedPayload(
  supabase: SupabaseClient,
  input: unknown
): Promise<ValidationResult> {
  const validated = parseOrcamentoPayload(input)
  if (!validated.success) return validated

  const canonicalized = await canonicalizeStockComponents(supabase, validated.data)
  if (!canonicalized.success) return canonicalized

  return calculatePayload(canonicalized.payload)
}

function quoteSelect() {
  return `
    id,
    cliente_nome,
    cliente_contato,
    cliente_endereco,
    status,
    slug_publico,
    validade,
    prazo_estimado,
    quantidade_total,
    valor_total,
    custo_total,
    margem_percentual,
    observacao_cliente,
    observacoes_internas,
    ativo,
    deleted_at,
    created_at,
    updated_at,
    orcamento_itens (
      id,
      orcamento_id,
      categoria_id,
      nome_produto,
      quantidade,
      custo_unitario,
      mao_obra_unitaria,
      valor_unitario,
      valor_total,
      ordem,
      created_at,
      updated_at,
      orcamento_componentes (
        id,
        orcamento_item_id,
        grupo_id,
        grupo_nome,
        material_id,
        material_nome,
        quantidade_por_item,
        unidade,
        custo_unitario_estimado,
        cor_hex,
        imagem_url,
        origem,
        observacao,
        ordem,
        created_at,
        updated_at
      )
    )
  `
}

export async function getOrcamentos(): Promise<OrcamentoComItens[]> {
  const supabase = await createAuthenticatedClient()
  const { data, error } = await supabase
    .from('orcamentos')
    .select(quoteSelect())
    .eq('ativo', true)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) {
    logServerError('orcamentos_list_failed', error, { table: 'orcamentos' })
    return []
  }

  return (data || []) as unknown as OrcamentoComItens[]
}

export async function getOrcamento(id: string): Promise<OrcamentoComItens | null> {
  if (!uuidRegex.test(id)) return null

  const supabase = await createAuthenticatedClient()
  const { data, error } = await supabase
    .from('orcamentos')
    .select(quoteSelect())
    .eq('id', id)
    .eq('ativo', true)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) {
    logServerError('orcamentos_get_failed', error, { table: 'orcamentos', orcamentoId: id })
    return null
  }

  return data as OrcamentoComItens | null
}

export async function createOrcamento(payload: OrcamentoPayload) {
  const supabase = await createAuthenticatedClient()
  const calculated = await prepareCalculatedPayload(supabase, payload)
  if (!calculated.success) return calculated

  const { itens, ...orcamento } = calculated.payload
  const { data: orcamentoId, error } = await supabase.rpc('salvar_orcamento_atomico', {
    p_orcamento_id: null,
    p_orcamento: {
      ...orcamento,
      status: 'rascunho' satisfies StatusOrcamento,
    },
    p_itens: itens,
  })

  if (error || !orcamentoId) {
    logServerError('orcamentos_create_failed', error, { table: 'orcamentos' })
    return { success: false, error: 'Não foi possível criar o orçamento' }
  }

  revalidatePath(ORCAMENTO_PATH)
  revalidatePath('/dashboard')
  return { success: true, orcamentoId: String(orcamentoId) }
}

export async function updateOrcamento(id: string, payload: OrcamentoUpdatePayload) {
  if (!uuidRegex.test(id)) {
    return { success: false, error: 'Orcamento invalido' }
  }

  const supabase = await createAuthenticatedClient()
  const { data: current, error: currentError } = await supabase
    .from('orcamentos')
    .select('id, status')
    .eq('id', id)
    .eq('ativo', true)
    .is('deleted_at', null)
    .maybeSingle()

  if (currentError || !current) {
    return { success: false, error: 'Orcamento nao encontrado' }
  }

  if (current.status === 'convertido') {
    const allowedKeys = new Set(['observacao_cliente', 'observacoes_internas'])
    if (Object.keys(payload).some((key) => !allowedKeys.has(key))) {
      return {
        success: false,
        error: 'Orçamento convertido permite alterar apenas observações',
      }
    }

    const convertedPayload = payload as Exclude<OrcamentoUpdatePayload, OrcamentoPayload>
    const updates: Record<string, string | null> = {}
    if ('observacao_cliente' in convertedPayload) {
      if (exceedsTextLimit(convertedPayload.observacao_cliente, 1200)) {
        return { success: false, error: 'Observação para cliente excede 1200 caracteres' }
      }
      updates.observacao_cliente = cleanOptionalText(convertedPayload.observacao_cliente)
    }
    if ('observacoes_internas' in convertedPayload) {
      if (exceedsTextLimit(convertedPayload.observacoes_internas, 3000)) {
        return { success: false, error: 'Observações internas excedem 3000 caracteres' }
      }
      updates.observacoes_internas = cleanOptionalText(convertedPayload.observacoes_internas, 3000)
    }
    if (Object.keys(updates).length === 0) {
      return { success: false, error: 'Nenhuma alteracao informada' }
    }

    const { data: updated, error } = await supabase
      .from('orcamentos')
      .update(updates)
      .eq('id', id)
      .eq('ativo', true)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle()
    if (error || !updated) {
      logServerError('orcamentos_update_notes_failed', error, {
        table: 'orcamentos',
        orcamentoId: id,
      })
      return { success: false, error: 'Não foi possível atualizar as observações' }
    }

    revalidatePath(ORCAMENTO_PATH)
    return { success: true }
  }

  if (!('itens' in payload)) {
    return { success: false, error: 'Informe os dados completos do orcamento' }
  }

  const calculated = await prepareCalculatedPayload(supabase, payload)
  if (!calculated.success) return calculated

  const { itens, ...orcamento } = calculated.payload
  const { data: updatedId, error: updateError } = await supabase.rpc(
    'salvar_orcamento_atomico',
    {
      p_orcamento_id: id,
      p_orcamento: orcamento,
      p_itens: itens,
    }
  )

  if (updateError || !updatedId) {
    logServerError('orcamentos_update_atomic_failed', updateError, {
      table: 'orcamentos',
      orcamentoId: id,
    })
    return { success: false, error: 'Não foi possível atualizar o orçamento' }
  }

  revalidatePath(ORCAMENTO_PATH)
  revalidatePath('/dashboard')
  return { success: true }
}

export async function updateOrcamentoStatus(id: string, status: StatusOrcamento) {
  if (!uuidRegex.test(id)) {
    return { success: false, error: 'Orcamento invalido' }
  }
  if (!statusPermitidos.includes(status)) {
    return { success: false, error: 'Status invalido' }
  }

  const supabase = await createAuthenticatedClient()
  const { data: current, error: currentError } = await supabase
    .from('orcamentos')
    .select('id, status')
    .eq('id', id)
    .eq('ativo', true)
    .is('deleted_at', null)
    .maybeSingle()

  if (currentError || !current) {
    return { success: false, error: 'Orçamento não encontrado' }
  }
  if (current.status === status) return { success: true }
  if (!canTransitionOrcamentoStatus(current.status as StatusOrcamento, status)) {
    return {
      success: false,
      error: `Não é permitido alterar de ${current.status} para ${status}`,
    }
  }

  const { data: updated, error } = await supabase.rpc('atualizar_status_orcamento', {
    p_orcamento_id: id,
    p_status: status,
  })

  if (error || !updated) {
    logServerError('orcamentos_status_update_failed', error, {
      table: 'orcamentos',
      orcamentoId: id,
    })
    return { success: false, error: 'Não foi possível atualizar o status' }
  }

  revalidatePath(ORCAMENTO_PATH)
  revalidatePath('/o/[slug]', 'page')
  revalidatePath('/orcamento/[slug]', 'page')
  return { success: true }
}

export async function deleteOrcamento(id: string) {
  if (!uuidRegex.test(id)) {
    return { success: false, error: 'Orcamento invalido' }
  }

  const supabase = await createAuthenticatedClient()
  const { data: archived, error } = await supabase
    .from('orcamentos')
    .update({ ativo: false, deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('ativo', true)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle()

  if (error || !archived) {
    logServerError('orcamentos_archive_failed', error, {
      table: 'orcamentos',
      orcamentoId: id,
    })
    return { success: false, error: 'Não foi possível excluir o orçamento' }
  }

  revalidatePath(ORCAMENTO_PATH)
  revalidatePath('/dashboard')
  return { success: true }
}

function createOrcamentoSlug() {
  const prefix = randomBytes(2).toString('hex').toUpperCase()
  const suffix = randomBytes(5).toString('base64url').replace(/[-_]/g, '').slice(0, 6)
  return `EXO-${prefix}-${suffix}`
}

async function ensureOrcamentoSlug(
  supabase: SupabaseClient,
  orcamentoId: string,
  currentSlug: string | null
) {
  if (currentSlug) return currentSlug

  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = createOrcamentoSlug()
    const { data, error } = await supabase
      .from('orcamentos')
      .update({ slug_publico: slug })
      .eq('id', orcamentoId)
      .eq('ativo', true)
      .is('slug_publico', null)
      .select('slug_publico')
      .maybeSingle()

    if (!error && data?.slug_publico) return data.slug_publico as string

    const { data: refreshed } = await supabase
      .from('orcamentos')
      .select('slug_publico')
      .eq('id', orcamentoId)
      .maybeSingle()
    if (refreshed?.slug_publico) return refreshed.slug_publico as string
  }

  throw new Error('Nao foi possivel gerar um link unico para o orcamento')
}

function normalizeWhatsAppPhone(value: string | null | undefined) {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  if (digits.length >= 12 && digits.length <= 13) return digits
  return null
}

async function getRequestBaseUrl() {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL
  if (envUrl) return String(envUrl).trim().replace(/\/+$/, '')

  if (process.env.NODE_ENV === 'development') {
    const headersList = await headers()
    const forwardedProto = headersList.get('x-forwarded-proto')
    const protocol = forwardedProto === 'http' ? 'http' : 'https'
    const rawHost =
      headersList.get('x-forwarded-host') ||
      headersList.get('host') ||
      process.env.VERCEL_URL ||
      'localhost:3000'
    const host = /^[a-z0-9.-]+(?::\d+)?$/i.test(rawHost) ? rawHost : 'localhost:3000'
    return `${protocol}://${host}`
  }

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`.replace(/\/+$/, '')
  }

  return 'https://exclusivart-artesanato.vercel.app'
}

export type GerarLinkOrcamentoResult =
  | {
      success: true
      quoteUrl: string
      whatsappUrl: string
      hasClientPhone: boolean
    }
  | {
      success: false
      error: string
    }

export async function gerarLinkOrcamento(id: string): Promise<GerarLinkOrcamentoResult> {
  if (!uuidRegex.test(id)) {
    return { success: false, error: 'Orcamento invalido' }
  }

  const supabase = await createAuthenticatedClient()
  const { data: orcamento, error } = await supabase
    .from('orcamentos')
    .select('id, cliente_nome, cliente_contato, slug_publico')
    .eq('id', id)
    .eq('ativo', true)
    .is('deleted_at', null)
    .maybeSingle()

  if (error || !orcamento) {
    return { success: false, error: 'Orcamento nao encontrado' }
  }

  let slug: string
  try {
    slug = await ensureOrcamentoSlug(supabase, orcamento.id, orcamento.slug_publico)
  } catch (slugError) {
    logServerError('orcamentos_public_link_failed', slugError, {
      table: 'orcamentos',
      orcamentoId: id,
    })
    return { success: false, error: 'Erro ao gerar link do orcamento' }
  }

  const baseUrl = await getRequestBaseUrl()
  const quoteUrl = `${baseUrl}/o/${slug}`
  const message = `Olá, ${orcamento.cliente_nome}! Preparei seu orçamento da Exclusiv ART. Você pode conferir aqui: ${quoteUrl}`
  const whatsappPhone = normalizeWhatsAppPhone(orcamento.cliente_contato)
  const whatsappUrl = whatsappPhone
    ? `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`

  revalidatePath(ORCAMENTO_PATH)
  return {
    success: true,
    quoteUrl,
    whatsappUrl,
    hasClientPhone: Boolean(whatsappPhone),
  }
}

// TODO: converter orçamento em pedido apenas por uma ação explícita, em uma fase futura.
