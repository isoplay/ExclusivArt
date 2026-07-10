'use server'

import { createHash, randomBytes } from 'node:crypto'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createAuthenticatedClient } from '@/lib/auth'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Pedido, PedidoComItens, Produto, StatusPedido, Material, ProdutoMaterial } from '@/lib/types/database'
import { arredondarParaCimaMeioReal } from '@/lib/utils'
import { roundCurrency } from '@/lib/number'
import { logServerError } from '@/lib/server-log'
import { BRAND_NAME } from '@/lib/brand'
import {
  escapePostgrestSearch,
  isFiniteNumberInRange,
  isValidDateOnly,
  isValidUuid,
} from '@/lib/security/input'

function normalizeKey(value: string | null | undefined) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function cleanOptionalText(value: unknown, maxLength = 1200) {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ')
  if (!text) return null
  return text.slice(0, maxLength)
}

async function resolveProdutoIdForCategoria(
  supabase: SupabaseClient,
  categoriaId: string
): Promise<string | null> {
  const { data: categoria } = await supabase
    .from('categorias_produtos')
    .select('nome')
    .eq('id', categoriaId)
    .maybeSingle()

  if (categoria?.nome) {
    const { data: porNome } = await supabase
      .from('produtos')
      .select('id, nome')
      .eq('ativo', true)
      .ilike('nome', categoria.nome)
      .limit(1)
      .maybeSingle()

    if (porNome?.id) return porNome.id
  }

  const nomeNorm = normalizeKey(categoria?.nome)
  const tipoMap: Record<string, string> = {
    terco: 'terco',
    pulseira: 'pulseira',
    chaveiro: 'chaveiro',
  }
  const tipo = tipoMap[nomeNorm] || 'outro'

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

export async function getPedidos() {
  const supabase = await createAuthenticatedClient()
  
  const { data, error } = await supabase
    .from('pedidos')
    .select(`
      *,
      pedido_itens (
        id,
        quantidade,
        valor_unitario,
        valor_total,
        produto:produtos (*),
        pedido_itens_materiais (
          id,
          material_id,
          quantidade,
          material:materiais (*)
        )
      )
    `)
    .eq('ativo', true)
    .order('data_pedido', { ascending: false })
    .limit(500)

  if (error) {
    logServerError('pedidos_list_failed', error, { table: 'pedidos' })
    return []
  }

  return data as PedidoComItens[]
}

export async function getPedido(id: string) {
  if (!isValidUuid(id)) return null

  const supabase = await createAuthenticatedClient()
  
  const { data, error } = await supabase
    .from('pedidos')
    .select(`
      *,
      pedido_itens (
        id,
        quantidade,
        valor_unitario,
        valor_total,
        produto:produtos (*),
        pedido_itens_materiais (
          id,
          material_id,
          quantidade,
          material:materiais (*)
        )
      )
    `)
    .eq('id', id)
    .eq('ativo', true)
    .single()

  if (error) {
    logServerError('pedidos_get_failed', error, { table: 'pedidos' })
    return null
  }

  return data as PedidoComItens
}

export async function getProdutosAtivos() {
  const supabase = await createAuthenticatedClient()
  
  const { data, error } = await supabase
    .from('produtos')
    .select('*')
    .eq('ativo', true)
    .order('nome')
    .limit(500)

  if (error) {
    logServerError('pedidos_products_failed', error, { table: 'produtos' })
    return []
  }

  return data as Produto[]
}

export async function getMateriaisDisponiveis() {
  const supabase = await createAuthenticatedClient()

  const { data, error } = await supabase
    .from('materiais')
    .select('*')
    .eq('ativo', true)
    .order('nome')
    .limit(1000)

  if (error) {
    logServerError('pedidos_materials_failed', error, { table: 'materiais' })
    return []
  }

  return data as Material[]
}

export type ItemInput = {
  produto_id: string
  quantidade: number
  valor_unitario: number
  materiais?: PedidoItemMaterialInput[]
}

async function buildAtomicPedidoItems(
  supabase: SupabaseClient,
  itens: ItemInput[]
) {
  return Promise.all(
    itens.map(async (item) => ({
      produto_id: item.produto_id,
      quantidade: item.quantidade,
      valor_unitario: item.valor_unitario,
      materiais: await resolveItemMateriais(
        supabase,
        item.produto_id,
        item.quantidade,
        item.materiais
      ),
    }))
  )
}

const statusPermitidos: StatusPedido[] = [
  'orcamento',
  'confirmado',
  'separando_materiais',
  'em_producao',
  'pronto',
  'entregue',
  'cancelado',
]

const MAX_PEDIDO_ITEMS = 50
const MAX_PEDIDO_COMPONENTS = 100

function createTrackingToken() {
  return randomBytes(32).toString('base64url')
}

function hashTrackingToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

// Short, unique, non-predictable public slug for /p/[slug] tracking links.
// Format example: EXA-0A1B-cOmUJBAJ (prefix + short entropy + random suffix)
function createTrackingSlug(): string {
  return `EXA-${randomBytes(18).toString('base64url')}`
}

async function ensureTrackingSlug(
  supabase: SupabaseClient,
  pedidoId: string
): Promise<string> {
  // Idempotent: reuse if already present on the pedido row
  const { data: current } = await supabase
    .from('pedidos')
    .select('slug_acompanhamento')
    .eq('id', pedidoId)
    .eq('ativo', true)
    .maybeSingle()

  if (current?.slug_acompanhamento) {
    return current.slug_acompanhamento as string
  }

  // Generate unique slug (retry on rare collision)
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = createTrackingSlug()
    const { data, error } = await supabase
      .from('pedidos')
      .update({ slug_acompanhamento: slug })
      .eq('id', pedidoId)
      .eq('ativo', true)
      .is('slug_acompanhamento', null)
      .select('slug_acompanhamento')
      .maybeSingle()

    if (!error && data?.slug_acompanhamento) {
      return data.slug_acompanhamento
    }

    const { data: refreshed } = await supabase
      .from('pedidos')
      .select('slug_acompanhamento')
      .eq('id', pedidoId)
      .eq('ativo', true)
      .maybeSingle()
    if (refreshed?.slug_acompanhamento) return refreshed.slug_acompanhamento
  }

  throw new Error('Unable to generate a unique tracking slug')
}

function normalizeWhatsAppPhone(value: string | null | undefined) {
  const digits = String(value ?? '').replace(/\D/g, '')

  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`
  }

  if (digits.length >= 12 && digits.length <= 13) {
    return digits
  }

  return null
}

function buildTrackingMessage(clienteNome: string, trackingUrl: string) {
  return `Olá, ${clienteNome}! Aqui está o link para acompanhar seu pedido da ${BRAND_NAME}: ${trackingUrl}`
}

export type GerarLinkAcompanhamentoResult =
  | {
      success: true
      trackingUrl: string
      whatsappUrl: string
      hasClientPhone: boolean
      expiresAt: string
    }
  | {
      success: false
      error: string
    }

async function getRequestBaseUrl() {
  // Priority: explicit public site URL (set in Vercel env vars etc). Always use if present.
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL
  if (envUrl) {
    return String(envUrl).trim().replace(/\/+$/, '')
  }

  // Only fall back to request headers / VERCEL_URL in development.
  // In production/preview without NEXT_PUBLIC_SITE_URL we avoid long preview domains
  // (e.g. v0-erp-para-artesanato-*-vercel.app) and use a safe production default or prod URL.
  const isDevelopment = process.env.NODE_ENV === 'development'
  if (isDevelopment) {
    const headersList = await headers()
    const forwardedProto = headersList.get('x-forwarded-proto')
    const protocol = forwardedProto === 'http' ? 'http' : 'https'
    const rawHost =
      headersList.get('x-forwarded-host') ||
      headersList.get('host') ||
      (process.env.VERCEL_URL ? process.env.VERCEL_URL : 'localhost:3000')
    const host = /^[a-z0-9.-]+(?::\d+)?$/i.test(rawHost) ? rawHost : 'localhost:3000'
    return `${protocol}://${host}`
  }

  // Non-dev fallback: prefer Vercel's production project URL (if exposed) then hard safe default
  // (prevents accidental long preview links when env var is not configured).
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`.replace(/\/+$/, '')
  }

  return 'https://exclusivart-artesanato.vercel.app'
}

function validatePedidoBasico(clienteNome: string, prazoEntrega?: string | null) {
  if (!clienteNome.trim() || clienteNome.length > 120) return 'Nome do cliente invalido'
  if (prazoEntrega && !isValidDateOnly(prazoEntrega)) {
    return 'Prazo de entrega invalido'
  }
  return null
}

function validatePedidoItems(itens: ItemInput[]) {
  if (!Array.isArray(itens) || itens.length < 1 || itens.length > MAX_PEDIDO_ITEMS) {
    return false
  }

  return itens.every(
    (item) =>
      isValidUuid(item.produto_id) &&
      Number.isInteger(item.quantidade) &&
      isFiniteNumberInRange(item.quantidade, 1, 10_000) &&
      isFiniteNumberInRange(item.valor_unitario, 0, 9_999_999_999) &&
      (!item.materiais ||
        (item.materiais.length <= MAX_PEDIDO_COMPONENTS &&
          item.materiais.every(
            (material) =>
              isValidUuid(material.material_id) &&
              isFiniteNumberInRange(material.quantidade, 0.001, 100_000)
          )))
  )
}

export async function createPedido(
  formData: FormData,
  itens: ItemInput[]
) {
  const supabase = await createAuthenticatedClient()

  const cliente_nome = String(formData.get('cliente_nome') ?? '')
  const cliente_contato = String(formData.get('cliente_contato') ?? '')
  const prazo_entrega = String(formData.get('prazo_entrega') ?? '')
  const prioridade = parseInt(formData.get('prioridade') as string) || 1
  const observacoes = String(formData.get('observacoes') ?? '')
  const observacao_cliente = cleanOptionalText(formData.get('observacao_cliente'))
  const validationError = validatePedidoBasico(cliente_nome, prazo_entrega)

  if (
    validationError ||
    cliente_contato.length > 80 ||
    observacoes.length > 3000 ||
    !Number.isInteger(prioridade) ||
    prioridade < 1 ||
    prioridade > 5
  ) {
    return { success: false, error: validationError || 'Dados do pedido invalidos' }
  }

  if (!validatePedidoItems(itens)) {
    return { success: false, error: 'Itens do pedido invalidos' }
  }

  const itensAtomicos = await buildAtomicPedidoItems(supabase, itens)
  const { data: pedidoId, error } = await supabase.rpc('criar_pedido_atomico', {
    p_pedido: {
      cliente_nome,
      cliente_contato: cliente_contato || null,
      prazo_entrega: prazo_entrega || null,
      status: 'separando_materiais',
      prioridade,
      observacoes: observacoes || null,
      observacao_cliente,
    },
    p_itens: itensAtomicos,
  })

  if (error || !pedidoId) {
    logServerError('pedidos_create_atomic_failed', error, { table: 'pedidos' })
    return { success: false, error: 'Nao foi possivel criar o pedido' }
  }

  revalidatePath('/dashboard/pedidos')
  revalidatePath('/dashboard')
  return { success: true, pedidoId }
}

export async function updatePedido(
  id: string,
  formData: FormData,
  itens: ItemInput[]
) {
  if (!isValidUuid(id)) {
    return { success: false, error: 'Pedido invalido' }
  }

  const supabase = await createAuthenticatedClient()

  const cliente_nome = String(formData.get('cliente_nome') ?? '')
  const cliente_contato = String(formData.get('cliente_contato') ?? '')
  const prazo_entrega = String(formData.get('prazo_entrega') ?? '')
  const prioridade = parseInt(formData.get('prioridade') as string) || 1
  const observacoes = String(formData.get('observacoes') ?? '')
  const observacao_cliente = cleanOptionalText(formData.get('observacao_cliente'))
  const validationError = validatePedidoBasico(cliente_nome, prazo_entrega)

  if (
    validationError ||
    cliente_contato.length > 80 ||
    observacoes.length > 3000 ||
    !Number.isInteger(prioridade) ||
    prioridade < 1 ||
    prioridade > 5
  ) {
    return { success: false, error: validationError || 'Dados do pedido invalidos' }
  }

  if (!validatePedidoItems(itens)) {
    return { success: false, error: 'Itens do pedido invalidos' }
  }

  const itensAtomicos = await buildAtomicPedidoItems(supabase, itens)
  const { data: action, error } = await supabase.rpc('atualizar_pedido_atomico', {
    p_pedido_id: id,
    p_pedido: {
      cliente_nome,
      cliente_contato: cliente_contato || null,
      prazo_entrega: prazo_entrega || null,
      prioridade,
      observacoes: observacoes || null,
      observacao_cliente,
    },
    p_itens: itensAtomicos,
  })

  if (error) {
    logServerError('pedidos_update_atomic_failed', error, { table: 'pedidos' })
    return { success: false, error: 'Nao foi possivel atualizar o pedido' }
  }

  revalidatePath('/dashboard/pedidos')
  revalidatePath('/dashboard')
  return { success: true, lockedMaterials: action === 'materiais_bloqueados' }
}

export async function updatePedidoObservacaoCliente(
  id: string,
  observacaoCliente: string
) {
  if (!isValidUuid(id)) {
    return { success: false, error: 'Pedido invalido' }
  }
  if (observacaoCliente.trim().length > 1200) {
    return { success: false, error: 'Observacao excede 1200 caracteres' }
  }

  const supabase = await createAuthenticatedClient()
  const observacao_cliente = cleanOptionalText(observacaoCliente)

  const { error } = await supabase
    .from('pedidos')
    .update({ observacao_cliente })
    .eq('id', id)
    .eq('ativo', true)

  if (error) {
    logServerError('pedidos_update_customer_note_failed', error, { table: 'pedidos' })
    return { success: false, error: 'Nao foi possivel atualizar a observacao' }
  }

  revalidatePath('/dashboard/pedidos')
  revalidatePath('/dashboard')
  revalidatePath('/p/[slug]', 'page')
  revalidatePath('/acompanhar/[token]', 'page')
  return { success: true }
}

export async function updatePedidoStatus(id: string, status: StatusPedido) {
  if (!isValidUuid(id) || !statusPermitidos.includes(status)) {
    return { success: false, error: 'Status invalido' }
  }

  const supabase = await createAuthenticatedClient()
  const { data: updated, error } = await supabase
    .from('pedidos')
    .update({ status })
    .eq('id', id)
    .eq('ativo', true)
    .select('id')
    .maybeSingle()

  if (error || !updated) {
    logServerError('pedidos_update_status_failed', error, { table: 'pedidos' })
    return { success: false, error: 'Nao foi possivel atualizar o status' }
  }

  revalidatePath('/dashboard/pedidos')
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/estoque')
  return { success: true }
}

export async function gerarLinkAcompanhamentoPedido(
  pedidoId: string
): Promise<GerarLinkAcompanhamentoResult> {
  if (!isValidUuid(pedidoId)) {
    return { success: false, error: 'Pedido invalido' }
  }

  const supabase = await createAuthenticatedClient()

  const { data: pedido, error: pedidoError } = await supabase
    .from('pedidos')
    .select('id, cliente_nome, cliente_contato')
    .eq('id', pedidoId)
    .eq('ativo', true)
    .maybeSingle()

  if (pedidoError || !pedido) {
    logServerError('pedido_tracking_link_pedido_failed', pedidoError, {
      table: 'pedidos',
      pedidoId,
    })
    return { success: false, error: 'Pedido nao encontrado' }
  }

  // Idempotent slug: reuse existing or generate+persist exactly once per pedido.
  // New public links prefer the short /p/[slug] form.
  let slug: string
  try {
    slug = await ensureTrackingSlug(supabase, pedido.id)
  } catch (error) {
    logServerError('pedido_tracking_slug_failed', error, {
      table: 'pedidos',
      pedidoId,
    })
    return { success: false, error: 'Nao foi possivel gerar o link' }
  }

  const expiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString()

  // Legacy token link: create the hash row ONLY if none exists yet.
  // This keeps previously sent /acompanhar/[token] links working (no overwrite of token_hash).
  const { data: existingLink, error: existingLinkError } = await supabase
    .from('pedido_acompanhamento_links')
    .select('id')
    .eq('pedido_id', pedido.id)
    .maybeSingle()

  if (existingLinkError) {
    logServerError('pedido_tracking_link_lookup_failed', existingLinkError, {
      table: 'pedido_acompanhamento_links',
      pedidoId,
    })
    return { success: false, error: 'Nao foi possivel consultar o link' }
  }

  if (!existingLink) {
    const token = createTrackingToken()
    const tokenHash = hashTrackingToken(token)
    const { error: linkError } = await supabase
      .from('pedido_acompanhamento_links')
      .insert({
        pedido_id: pedido.id,
        token_hash: tokenHash,
        ativo: true,
        last_sent_at: new Date().toISOString(),
        expires_at: expiresAt,
      })

    if (linkError) {
      logServerError('pedido_tracking_link_insert_failed', linkError, {
        table: 'pedido_acompanhamento_links',
        pedidoId,
      })
      return { success: false, error: 'Nao foi possivel ativar o link' }
    }
  } else {
    const { error: refreshError } = await supabase
      .from('pedido_acompanhamento_links')
      .update({
        ativo: true,
        last_sent_at: new Date().toISOString(),
        expires_at: expiresAt,
      })
      .eq('id', existingLink.id)

    if (refreshError) {
      logServerError('pedido_tracking_link_refresh_failed', refreshError, {
        table: 'pedido_acompanhamento_links',
        pedidoId,
      })
      return { success: false, error: 'Nao foi possivel ativar o link' }
    }
  }

  const baseUrl = await getRequestBaseUrl()
  // Prefer short public slug path. /acompanhar/[token] remains available for old links.
  const trackingUrl = `${baseUrl}/p/${slug}`
  const message = buildTrackingMessage(pedido.cliente_nome, trackingUrl)
  const whatsappPhone = normalizeWhatsAppPhone(pedido.cliente_contato)
  const whatsappUrl = whatsappPhone
    ? `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`

  revalidatePath('/dashboard/pedidos')
  return {
    success: true,
    trackingUrl,
    whatsappUrl,
    hasClientPhone: Boolean(whatsappPhone),
    expiresAt,
  }
}

export type MaterialBaixaPreview = {
  material_id: string
  material_nome: string
  unidade: string
  quantidade: number
  estoque_atual: number
  suficiente: boolean
}

async function resolveItemMateriais(
  supabase: SupabaseClient,
  produtoId: string,
  quantidadeItem: number,
  customMateriais?: PedidoItemMaterialInput[]
): Promise<PedidoItemMaterialInput[]> {
  if (customMateriais?.length) {
    return customMateriais
  }

  const { data } = await supabase
    .from('produto_materiais')
    .select('material_id, quantidade_usada')
    .eq('produto_id', produtoId)

  return (data || []).map((pm) => ({
    material_id: pm.material_id,
    quantidade: pm.quantidade_usada * quantidadeItem,
  }))
}

export async function getMateriaisBaixaPedido(
  pedidoId: string
): Promise<MaterialBaixaPreview[]> {
  if (!isValidUuid(pedidoId)) return []

  const supabase = await createAuthenticatedClient()

  const { data: itens, error } = await supabase
    .from('pedido_itens')
    .select(`
      id,
      quantidade,
      produto_id,
      pedido_itens_materiais (
        material_id,
        quantidade,
        material:materiais (nome, unidade, quantidade, quantidade_atual)
      )
    `)
    .eq('pedido_id', pedidoId)

  if (error || !itens) {
    logServerError('pedidos_material_preview_failed', error, { table: 'pedido_itens' })
    return []
  }

  const agregado = new Map<string, MaterialBaixaPreview>()

  for (const item of itens) {
    const customMats = (item.pedido_itens_materiais || []) as unknown as Array<{
      material_id: string
      quantidade: number
      material:
        | { nome: string; unidade: string; quantidade: number; quantidade_atual?: number }
        | { nome: string; unidade: string; quantidade: number; quantidade_atual?: number }[]
    }>

    if (customMats?.length) {
      for (const mat of customMats) {
        const material = Array.isArray(mat.material) ? mat.material[0] : mat.material
        if (!material) continue
        
        const atual = material.quantidade_atual ?? material.quantidade ?? 0
        const existing = agregado.get(mat.material_id)
        if (existing) {
          existing.quantidade += mat.quantidade
          existing.suficiente = atual >= existing.quantidade
        } else {
          agregado.set(mat.material_id, {
            material_id: mat.material_id,
            material_nome: material.nome,
            unidade: material.unidade,
            quantidade: mat.quantidade,
            estoque_atual: atual,
            suficiente: atual >= mat.quantidade,
          })
        }
      }
      continue
    }

    const { data: composicao } = await supabase
      .from('produto_materiais')
      .select(`
        material_id,
        quantidade_usada,
        material:materiais (nome, unidade, quantidade, quantidade_atual)
      `)
      .eq('produto_id', item.produto_id)

    for (const pm of composicao || []) {
      const material = Array.isArray(pm.material) ? pm.material[0] : pm.material
      if (!material) continue
      
      const qtd = pm.quantidade_usada * item.quantidade
      const atual = material.quantidade_atual ?? material.quantidade ?? 0
      const existing = agregado.get(pm.material_id)
      if (existing) {
        existing.quantidade += qtd
        existing.suficiente = atual >= existing.quantidade
      } else {
        agregado.set(pm.material_id, {
          material_id: pm.material_id,
          material_nome: material.nome,
          unidade: material.unidade,
          quantidade: qtd,
          estoque_atual: atual,
          suficiente: atual >= qtd,
        })
      }
    }
  }

  return Array.from(agregado.values())
}

export async function deletePedido(id: string) {
  if (!isValidUuid(id)) {
    return { success: false, error: 'Pedido invalido' }
  }

  const supabase = await createAuthenticatedClient()

  const { error } = await supabase.rpc('arquivar_pedido', {
    p_pedido_id: id,
  })

  if (error) {
    logServerError('pedidos_archive_failed', error, { table: 'pedidos' })
    return { success: false, error: 'Nao foi possivel arquivar o pedido' }
  }

  revalidatePath('/dashboard/pedidos')
  revalidatePath('/dashboard')
  return { success: true }
}

export type ClienteHistorico = {
  cliente_nome: string
  cliente_contato: string | null
  total_pedidos: number
  valor_total: number
  ultimo_pedido: string
}

export type MaterialNecessario = {
  material_id: string
  material_nome: string
  unidade: string
  quantidade_necessaria: number
  quantidade_disponivel: number
  suficiente: boolean
}

export type VerificacaoProducao = {
  produto_id: string
  produto_nome: string
  quantidade: number
  pode_produzir: boolean
  quantidade_maxima: number
  materiais: MaterialNecessario[]
  tempo_producao_total: number
}

export async function verificarMateriaisProducao(
  itens: { produto_id: string; quantidade: number }[]
): Promise<VerificacaoProducao[]> {
  if (
    !Array.isArray(itens) ||
    itens.length > MAX_PEDIDO_ITEMS ||
    itens.some(
      (item) =>
        !isValidUuid(item.produto_id) ||
        !isFiniteNumberInRange(item.quantidade, 0.001, 10_000)
    )
  ) {
    return []
  }

  const supabase = await createAuthenticatedClient()
  
  // Get all product compositions with materials
  const { data: produtos, error: produtosError } = await supabase
    .from('produtos')
    .select(`
      id,
      nome,
      produto_materiais (
        quantidade_usada,
        material:materiais (
          id,
          nome,
          unidade,
          quantidade,
          quantidade_atual
        )
      )
    `)
    .in('id', itens.map(i => i.produto_id))

  if (produtosError || !produtos) {
    logServerError('pedidos_production_products_failed', produtosError, {
      table: 'produtos',
    })
    return []
  }

  const verificacoes: VerificacaoProducao[] = []

  type MaterialResumo = Pick<Material, 'id' | 'nome' | 'unidade'> & {
    quantidade?: number
    quantidade_atual?: number
  }
  
  // Create a map to track material usage across all items
  const materialUsado = new Map<string, number>()

  for (const item of itens) {
    const produto = produtos.find(p => p.id === item.produto_id)
    if (!produto) continue

    const materiaisNecessarios: MaterialNecessario[] = []
    let podeProduzir = true
    let quantidadeMaxima = Infinity

    for (const pm of produto.produto_materiais) {
      if (!pm.material) continue
      
      const material = pm.material as unknown as MaterialResumo
      const qtdUsada = pm.quantidade_usada ?? 0
      const quantidadeNecessaria = qtdUsada * item.quantidade
      const jaUsado = materialUsado.get(material.id) || 0
      const estoque = material.quantidade_atual ?? material.quantidade ?? 0
      const disponivel = estoque - jaUsado
      const suficiente = disponivel >= quantidadeNecessaria

      if (!suficiente) {
        podeProduzir = false
      }

      const maxUnidades = qtdUsada > 0 ? Math.floor(disponivel / qtdUsada) : Infinity
      quantidadeMaxima = Math.min(quantidadeMaxima, maxUnidades)

      materiaisNecessarios.push({
        material_id: material.id,
        material_nome: material.nome,
        unidade: material.unidade,
        quantidade_necessaria: quantidadeNecessaria,
        quantidade_disponivel: disponivel,
        suficiente,
      })

      // Update used materials
      materialUsado.set(material.id, jaUsado + quantidadeNecessaria)
    }

    verificacoes.push({
      produto_id: item.produto_id,
      produto_nome: produto.nome,
      quantidade: item.quantidade,
      pode_produzir: podeProduzir,
      quantidade_maxima: quantidadeMaxima === Infinity ? 0 : quantidadeMaxima,
      materiais: materiaisNecessarios,
      tempo_producao_total: 0,
    })
  }

  return verificacoes
}

export async function searchClientes(query: string): Promise<ClienteHistorico[]> {
  const normalizedQuery = query.trim().replace(/\s+/g, ' ')
  if (normalizedQuery.length < 2 || normalizedQuery.length > 80) return []
  
  const supabase = await createAuthenticatedClient()
  
  const { data, error } = await supabase
    .from('pedidos')
    .select('cliente_nome, cliente_contato, valor_total, data_pedido')
    .ilike('cliente_nome', `%${escapePostgrestSearch(normalizedQuery)}%`)
    .order('data_pedido', { ascending: false })
    .limit(50)

  if (error || !data) {
    logServerError('pedidos_client_search_failed', error, { table: 'pedidos' })
    return []
  }

  // Group by client name and aggregate
  const clienteMap = new Map<string, ClienteHistorico>()
  
  for (const pedido of data) {
    const existing = clienteMap.get(pedido.cliente_nome)
    if (existing) {
      existing.total_pedidos++
      existing.valor_total += pedido.valor_total
    } else {
      clienteMap.set(pedido.cliente_nome, {
        cliente_nome: pedido.cliente_nome,
        cliente_contato: pedido.cliente_contato,
        total_pedidos: 1,
        valor_total: pedido.valor_total,
        ultimo_pedido: pedido.data_pedido,
      })
    }
  }

  return Array.from(clienteMap.values()).slice(0, 5)
}

// Materiais do pedido
export type PedidoItemMaterialInput = {
  material_id: string
  quantidade: number
}

export type PedidoCustomizadoItemInput = {
  categoria_id: string
  quantidade_itens: number
  componentes: Array<{ material_id: string; quantidade: number }>
  margem_percentual?: number
  mao_obra_valor?: number
  valor_final_manual?: number | null
  motivo_ajuste_preco?: string | null
}

export type PedidoCustomizadoInput = {
  cliente_nome: string
  cliente_telefone: string | null
  cliente_endereco: string | null
  categoria_id: string
  quantidade_itens: number
  componentes: Array<{ material_id: string; quantidade: number }>
  prazo_entrega: string
  observacoes: string | null
  observacao_cliente?: string | null
  margem_percentual?: number
  mao_obra_valor?: number
  valor_final_manual?: number | null
  motivo_ajuste_preco?: string | null
  itens?: PedidoCustomizadoItemInput[]
}

function getPedidoCustomizadoItens(params: PedidoCustomizadoInput): PedidoCustomizadoItemInput[] {
  if (Array.isArray(params.itens) && params.itens.length > 0) {
    return params.itens
  }

  return [
    {
      categoria_id: params.categoria_id,
      quantidade_itens: params.quantidade_itens,
      componentes: params.componentes,
      margem_percentual: params.margem_percentual,
      mao_obra_valor: params.mao_obra_valor,
      valor_final_manual: params.valor_final_manual,
      motivo_ajuste_preco: params.motivo_ajuste_preco,
    },
  ]
}

function validatePedidoCustomizadoItem(item: PedidoCustomizadoItemInput) {
  return (
    isValidUuid(item.categoria_id) &&
    isFiniteNumberInRange(item.quantidade_itens, 1, 10_000) &&
    isFiniteNumberInRange(item.margem_percentual ?? 100, 0, 100_000) &&
    isFiniteNumberInRange(item.mao_obra_valor ?? 0, 0, 9_999_999_999) &&
    (item.valor_final_manual == null ||
      isFiniteNumberInRange(item.valor_final_manual, 0, 9_999_999_999)) &&
    String(item.motivo_ajuste_preco ?? '').length <= 500 &&
    Array.isArray(item.componentes) &&
    item.componentes.length >= 1 &&
    item.componentes.length <= MAX_PEDIDO_COMPONENTS &&
    item.componentes.every(
      (component) =>
        isValidUuid(component.material_id) &&
        isFiniteNumberInRange(component.quantidade, 0.001, 100_000)
    )
  )
}

function validatePedidoCustomizadoInput(params: PedidoCustomizadoInput) {
  const itens = getPedidoCustomizadoItens(params)

  if (
    params.cliente_nome.trim().length < 1 ||
    params.cliente_nome.trim().length > 120 ||
    String(params.cliente_telefone ?? '').length > 80 ||
    String(params.cliente_endereco ?? '').length > 500 ||
    String(params.observacoes ?? '').length > 3000 ||
    String(params.observacao_cliente ?? '').length > 1200 ||
    (Boolean(params.prazo_entrega) && !isValidDateOnly(params.prazo_entrega)) ||
    itens.length < 1 ||
    itens.length > MAX_PEDIDO_ITEMS ||
    itens.some((item) => !validatePedidoCustomizadoItem(item))
  ) {
    return false
  }

  return true
}

function resolveValorFinalManual(valorCalculado: number, valorManual?: number | null) {
  if (valorManual == null) return { valorFinal: valorCalculado, precoManual: false }
  if (!Number.isFinite(valorManual) || valorManual < 0) {
    return { valorFinal: valorCalculado, precoManual: false }
  }

  const valorFinal = roundCurrency(valorManual)
  return {
    valorFinal,
    precoManual: Math.abs(valorFinal - valorCalculado) >= 0.01,
  }
}

function buildPrecoAudit(valorCalculado: number, valorFinal: number, motivo?: string | null) {
  const diferenca = roundCurrency(valorFinal - valorCalculado)
  const percentual =
    valorCalculado > 0 ? roundCurrency((diferenca / valorCalculado) * 100) : 0

  return {
    valor_calculado_total: valorCalculado,
    preco_manual: Math.abs(diferenca) >= 0.01,
    ajuste_manual_valor: diferenca,
    ajuste_manual_percentual: percentual,
    motivo_ajuste_preco: cleanOptionalText(motivo, 500),
  }
}

async function buildPedidoCustomizadoItensAtomicos(
  supabase: SupabaseClient,
  params: PedidoCustomizadoInput
) {
  const itens = getPedidoCustomizadoItens(params)
  const materialIds = Array.from(
    new Set(itens.flatMap((item) => item.componentes.map((componente) => componente.material_id)))
  )

  const materiaisResult = await supabase
    .from('materiais')
    .select('id, nome, custo_unitario, quantidade, quantidade_atual')
    .in('id', materialIds)
    .eq('ativo', true)

  if (materiaisResult.error || !materiaisResult.data) {
    logServerError('pedidos_selected_materials_failed', materiaisResult.error, {
      table: 'materiais',
    })
    return { success: false as const, error: 'Erro ao carregar materiais selecionados' }
  }

  const materiais = materiaisResult.data
  const itensAtomicos = []
  const faltantes: string[] = []

  for (const item of itens) {
    const quantidadeItens = Math.max(1, item.quantidade_itens || 1)
    const margemPercentual = Math.max(0, item.margem_percentual ?? 100)
    let custoMateriaisTotal = 0

    for (const componente of item.componentes) {
      const material = materiais.find((materialItem) => materialItem.id === componente.material_id)
      if (!material) {
        faltantes.push('Material nao encontrado')
        continue
      }

      const quantidadeTotal = componente.quantidade * quantidadeItens
      const estoqueAtual = material.quantidade_atual ?? material.quantidade ?? 0

      if (estoqueAtual < quantidadeTotal) {
        faltantes.push(`${material.nome}: estoque ${estoqueAtual}, necessario ${quantidadeTotal}`)
      }

      custoMateriaisTotal += (material.custo_unitario || 0) * quantidadeTotal
    }

    const produtoId = await resolveProdutoIdForCategoria(supabase, item.categoria_id)
    if (!produtoId) {
      return {
        success: false as const,
        error: 'Cadastre um produto antes de criar pedidos.',
      }
    }

    const maodeobraTotal = Number(item.mao_obra_valor || 0)
    const custoBase = custoMateriaisTotal + maodeobraTotal
    const valorComMargem = custoBase * (1 + margemPercentual / 100)
    const valorCalculado = arredondarParaCimaMeioReal(valorComMargem)
    const { valorFinal } = resolveValorFinalManual(valorCalculado, item.valor_final_manual)
    const precoAudit = buildPrecoAudit(
      valorCalculado,
      valorFinal,
      item.motivo_ajuste_preco
    )

    itensAtomicos.push({
      produto_id: produtoId,
      quantidade: quantidadeItens,
      valor_unitario: valorFinal / quantidadeItens,
      ...precoAudit,
      materiais: item.componentes.map((componente) => ({
        material_id: componente.material_id,
        quantidade: componente.quantidade * quantidadeItens,
      })),
    })
  }

  if (faltantes.length > 0) {
    return {
      success: false as const,
      error: `Estoque insuficiente: ${faltantes.join(', ')}`,
    }
  }

  return {
    success: true as const,
    itensAtomicos,
    tipoProdutoId: itens[0]?.categoria_id,
  }
}

export async function addMateriaisAoPedidoItem(
  pedidoItemId: string,
  materiais: PedidoItemMaterialInput[]
) {
  if (
    !isValidUuid(pedidoItemId) ||
    !Array.isArray(materiais) ||
    materiais.length > MAX_PEDIDO_COMPONENTS ||
    materiais.some(
      (material) =>
        !isValidUuid(material.material_id) ||
        !isFiniteNumberInRange(material.quantidade, 0.001, 100_000)
    )
  ) {
    return { success: false, error: 'Materiais do pedido invalidos' }
  }

  const supabase = await createAuthenticatedClient()

  const { error } = await supabase.rpc('substituir_materiais_pedido_item', {
    p_pedido_item_id: pedidoItemId,
    p_materiais: materiais,
  })

  if (error) {
    logServerError('pedidos_replace_item_materials_failed', error, {
      table: 'pedido_itens_materiais',
    })
    return { success: false, error: 'Nao foi possivel atualizar os materiais' }
  }

  revalidatePath('/dashboard/pedidos')
  return { success: true }
}

export async function getPedidoItemMateriais(pedidoItemId: string) {
  if (!isValidUuid(pedidoItemId)) return []

  const supabase = await createAuthenticatedClient()

  const { data, error } = await supabase
    .from('pedido_itens_materiais')
    .select('*, material:materiais(*)')
    .eq('pedido_item_id', pedidoItemId)

  if (error) {
    logServerError('pedidos_item_materials_failed', error, {
      table: 'pedido_itens_materiais',
    })
    return []
  }

  return data
}

// Nova função para criar pedido com componentes customizados
export async function getPedidoParaEdicao(id: string) {
  if (!isValidUuid(id)) {
    return { success: false, error: 'Pedido invalido' }
  }

  const pedido = await getPedido(id)

  if (!pedido) {
    return { success: false, error: 'Pedido nao encontrado' }
  }

  return { success: true, pedido }
}

export async function createPedidoCustomizado(params: PedidoCustomizadoInput) {
  const supabase = await createAuthenticatedClient()

  try {
    if (!validatePedidoCustomizadoInput(params)) {
      return { success: false, error: 'Dados do pedido invalidos' }
    }

    const validationError = validatePedidoBasico(params.cliente_nome, params.prazo_entrega)

    if (validationError) {
      return { success: false, error: validationError }
    }

    const itensResult = await buildPedidoCustomizadoItensAtomicos(supabase, params)
    if (!itensResult.success) return itensResult

    const { data: pedidoId, error: pedidoError } = await supabase.rpc('criar_pedido_atomico', {
      p_pedido: {
        cliente_nome: params.cliente_nome,
        cliente_contato: params.cliente_telefone,
        cliente_endereco: params.cliente_endereco,
        prazo_entrega: params.prazo_entrega,
        status: 'separando_materiais',
        prioridade: 1,
        observacoes: params.observacoes,
        observacao_cliente: cleanOptionalText(params.observacao_cliente),
        tipo_produto_id: itensResult.tipoProdutoId,
      },
      p_itens: itensResult.itensAtomicos,
    })

    if (pedidoError || !pedidoId) {
      logServerError('pedidos_create_custom_atomic_failed', pedidoError, {
        table: 'pedidos',
      })
      return { success: false, error: 'Nao foi possivel criar o pedido' }
    }

    revalidatePath('/dashboard/pedidos')
    revalidatePath('/dashboard')
    revalidatePath('/dashboard/estoque')
    return { success: true, pedidoId }
  } catch (error) {
    logServerError('pedidos_create_custom_exception', error)
    return { success: false, error: 'Erro ao criar pedido customizado' }
  }
}

// Função para trazer dados necessários para o form de pedido
export async function updatePedidoCustomizado(id: string, params: PedidoCustomizadoInput) {
  if (!isValidUuid(id)) {
    return { success: false, error: 'Pedido invalido' }
  }

  const supabase = await createAuthenticatedClient()

  try {
    if (!validatePedidoCustomizadoInput(params)) {
      return { success: false, error: 'Dados do pedido invalidos' }
    }

    const validationError = validatePedidoBasico(params.cliente_nome, params.prazo_entrega)

    if (validationError) {
      return { success: false, error: validationError }
    }

    const { data: pedidoAtual, error: pedidoAtualError } = await supabase
      .from('pedidos')
      .select('id, estoque_baixado')
      .eq('id', id)
      .eq('ativo', true)
      .maybeSingle()

    if (pedidoAtualError || !pedidoAtual) {
      return { success: false, error: 'Pedido nao encontrado' }
    }

    const dadosBasicos = {
      cliente_nome: params.cliente_nome,
      cliente_contato: params.cliente_telefone,
      cliente_endereco: params.cliente_endereco,
      prazo_entrega: params.prazo_entrega,
      observacoes: params.observacoes,
      observacao_cliente: cleanOptionalText(params.observacao_cliente),
    }

    if (pedidoAtual.estoque_baixado) {
      const { error } = await supabase
        .from('pedidos')
        .update(dadosBasicos)
        .eq('id', id)
        .eq('ativo', true)

      if (error) {
        logServerError('pedidos_update_locked_failed', error, { table: 'pedidos' })
        return { success: false, error: 'Nao foi possivel atualizar o pedido' }
      }

      revalidatePath('/dashboard/pedidos')
      revalidatePath('/dashboard')
      revalidatePath('/p/[slug]', 'page')
      revalidatePath('/acompanhar/[token]', 'page')
      return { success: true, lockedMaterials: true }
    }

    const itensResult = await buildPedidoCustomizadoItensAtomicos(supabase, params)
    if (!itensResult.success) return itensResult

    const { data: action, error: pedidoError } = await supabase.rpc(
      'atualizar_pedido_atomico',
      {
        p_pedido_id: id,
        p_pedido: {
          ...dadosBasicos,
          prioridade: 1,
          tipo_produto_id: itensResult.tipoProdutoId,
        },
        p_itens: itensResult.itensAtomicos,
      }
    )

    if (pedidoError) {
      logServerError('pedidos_update_custom_atomic_failed', pedidoError, {
        table: 'pedidos',
      })
      return { success: false, error: 'Nao foi possivel atualizar o pedido' }
    }

    revalidatePath('/dashboard/pedidos')
    revalidatePath('/dashboard')
    revalidatePath('/dashboard/estoque')
    revalidatePath('/p/[slug]', 'page')
    revalidatePath('/acompanhar/[token]', 'page')
    return { success: true, lockedMaterials: action === 'materiais_bloqueados' }
  } catch (error) {
    logServerError('pedidos_update_custom_exception', error)
    return { success: false, error: 'Erro ao editar pedido customizado' }
  }
}

export async function getCategoriasComComponentes() {
  const supabase = await createAuthenticatedClient()

  try {
    // Get all categories
    const { data: categorias, error: catError } = await supabase
      .from('categorias_produtos')
      .select('*')
      .eq('ativo', true)
      .order('ordem')

    if (catError || !categorias) {
      logServerError('pedidos_form_categories_failed', catError, {
        table: 'categorias_produtos',
      })
      return { categorias: [], grupos: [], componentes: [], maodeobra: {} }
    }

    // Get all component groups
    const { data: grupos, error: grupoError } = await supabase
      .from('grupos_componentes')
      .select('*')
      .eq('ativo', true)
      .order('ordem')

    if (grupoError) {
      logServerError('pedidos_form_groups_failed', grupoError, {
        table: 'grupos_componentes',
      })
    }

    // Get all components with materials
    const { data: componentes, error: compError } = await supabase
      .from('componentes_estoque')
      .select('*, material:materiais(*)')
      .eq('ativo', true)
      .order('ordem')

    if (compError) {
      logServerError('pedidos_form_components_failed', compError, {
        table: 'componentes_estoque',
      })
    }

    // Get labor costs
    const { data: maodeobras } = await supabase
      .from('configuracao_maodeobra')
      .select('categoria_id, valor_maodeobra')

    const maodeobra: { [key: string]: number } = {}
    ;(maodeobras || []).forEach((m) => {
      maodeobra[m.categoria_id] = m.valor_maodeobra
    })

    return {
      categorias: categorias || [],
      grupos: grupos || [],
      componentes: componentes || [],
      maodeobra,
    }
  } catch (error) {
    logServerError('pedidos_form_data_exception', error)
    return { categorias: [], grupos: [], componentes: [], maodeobra: {} }
  }
}
