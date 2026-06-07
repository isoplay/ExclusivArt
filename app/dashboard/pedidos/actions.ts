'use server'

import { createHash, randomBytes } from 'node:crypto'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createAuthenticatedClient } from '@/lib/auth'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Pedido, PedidoComItens, Produto, StatusPedido, Material, ProdutoMaterial } from '@/lib/types/database'
import { arredondarParaCimaMeioReal } from '@/lib/utils'
import { logServerError } from '@/lib/server-log'

function normalizeKey(value: string | null | undefined) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
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
        produto:produtos (*)
      )
    `)
    .order('data_pedido', { ascending: false })

  if (error) {
    console.error('Error fetching orders:', error)
    return []
  }

  return data as PedidoComItens[]
}

export async function getPedido(id: string) {
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
        produto:produtos (*)
      )
    `)
    .eq('id', id)
    .single()

  if (error) {
    console.error('Error fetching order:', error)
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

  if (error) {
    console.error('Error fetching products:', error)
    return []
  }

  return data as Produto[]
}

export async function getMateriaisDisponiveis() {
  const supabase = await createAuthenticatedClient()

  const { data, error } = await supabase
    .from('materiais')
    .select('*')
    .order('nome')

  if (error) {
    console.error('Error fetching materials:', error)
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

const statusPermitidos: StatusPedido[] = [
  'orcamento',
  'confirmado',
  'separando_materiais',
  'em_producao',
  'pronto',
  'entregue',
  'cancelado',
]

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function createTrackingToken() {
  return randomBytes(32).toString('base64url')
}

function hashTrackingToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

// Short, unique, non-predictable public slug for /p/[slug] tracking links.
// Format example: EXA-0A1B-cOmUJBAJ (prefix + short entropy + random suffix)
function createTrackingSlug(): string {
  const rand1 = randomBytes(2).toString('hex').toUpperCase() // e.g. 0042 style
  const rand2 = randomBytes(5).toString('base64url').replace(/[-_]/g, '').slice(0, 8)
  return `EXA-${rand1}-${rand2}`
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
    .maybeSingle()

  if (current?.slug_acompanhamento) {
    return current.slug_acompanhamento as string
  }

  // Generate unique slug (retry on rare collision)
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = createTrackingSlug()
    const { data: conflict } = await supabase
      .from('pedidos')
      .select('id')
      .eq('slug_acompanhamento', slug)
      .maybeSingle()

    if (conflict) continue

    const { error } = await supabase
      .from('pedidos')
      .update({ slug_acompanhamento: slug })
      .eq('id', pedidoId)

    if (!error) {
      return slug
    }
  }

  // Fallback (still unique enough for this use case)
  const fallback = `EXA-${pedidoId.replace(/-/g, '').slice(0, 8).toUpperCase()}`
  await supabase
    .from('pedidos')
    .update({ slug_acompanhamento: fallback })
    .eq('id', pedidoId)
  // Intentionally ignore errors on fallback slug persistence (extremely rare)
  return fallback
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
  return `Olá, ${clienteNome}! Aqui está o link para acompanhar seu pedido da Exclusiv ART: ${trackingUrl}`
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
  if (prazoEntrega && Number.isNaN(Date.parse(prazoEntrega))) {
    return 'Prazo de entrega invalido'
  }
  return null
}

export async function createPedido(
  formData: FormData,
  itens: ItemInput[]
) {
  const supabase = await createAuthenticatedClient()

  const cliente_nome = formData.get('cliente_nome') as string
  const cliente_contato = formData.get('cliente_contato') as string
  const prazo_entrega = formData.get('prazo_entrega') as string
  const prioridade = parseInt(formData.get('prioridade') as string) || 1
  const observacoes = formData.get('observacoes') as string
  const validationError = validatePedidoBasico(cliente_nome, prazo_entrega)

  if (validationError) {
    return { success: false, error: validationError }
  }

  if (itens.some((item) => item.quantidade <= 0 || item.quantidade > 10000 || item.valor_unitario < 0)) {
    return { success: false, error: 'Itens do pedido invalidos' }
  }

  const valor_total = itens.reduce((acc, item) => acc + item.valor_unitario * item.quantidade, 0)

  const { data: pedido, error: pedidoError } = await supabase
    .from('pedidos')
    .insert({
      cliente_nome,
      cliente_contato: cliente_contato || null,
      prazo_entrega: prazo_entrega || null,
      data_pedido: new Date().toISOString(),
      status: 'orcamento',
      prioridade,
      valor_total,
      observacoes: observacoes || null,
    })
    .select()
    .single()

  if (pedidoError || !pedido) {
    console.error('Error creating order:', pedidoError)
    return { success: false, error: pedidoError?.message || 'Erro ao criar pedido' }
  }

  if (itens.length > 0) {
    const itensToInsert = itens.map(item => ({
      pedido_id: pedido.id,
      produto_id: item.produto_id,
      quantidade: item.quantidade,
      valor_unitario: item.valor_unitario,
    }))

    const { data: insertedItens, error: itensError } = await supabase
      .from('pedido_itens')
      .insert(itensToInsert)
      .select('id')

    if (itensError || !insertedItens) {
      console.error('Error adding items:', itensError)
      await supabase.from('pedidos').delete().eq('id', pedido.id)
      return { success: false, error: 'Erro ao adicionar itens' }
    }

    for (let i = 0; i < itens.length; i++) {
      const item = itens[i]
      const materiais = await resolveItemMateriais(
        supabase,
        item.produto_id,
        item.quantidade,
        item.materiais
      )
      if (materiais.length && insertedItens[i]) {
        const matResult = await addMateriaisAoPedidoItem(insertedItens[i].id, materiais)
        if (!matResult.success) {
          console.error('Error adding item materials:', matResult.error)
        }
      }
    }
  }

  revalidatePath('/dashboard/pedidos')
  revalidatePath('/dashboard')
  return { success: true, pedidoId: pedido.id }
}

export async function updatePedido(
  id: string,
  formData: FormData,
  itens: ItemInput[]
) {
  const supabase = await createAuthenticatedClient()

  const cliente_nome = formData.get('cliente_nome') as string
  const cliente_contato = formData.get('cliente_contato') as string
  const prazo_entrega = formData.get('prazo_entrega') as string
  const prioridade = parseInt(formData.get('prioridade') as string) || 1
  const observacoes = formData.get('observacoes') as string

  // Calculate total
  const valor_total = itens.reduce((acc, item) => acc + item.valor_unitario * item.quantidade, 0)

  // Update order
  const { error: pedidoError } = await supabase
    .from('pedidos')
    .update({
      cliente_nome,
      cliente_contato: cliente_contato || null,
      prazo_entrega: prazo_entrega || null,
      prioridade,
      valor_total,
      observacoes: observacoes || null,
    })
    .eq('id', id)

  if (pedidoError) {
    console.error('Error updating order:', pedidoError)
    return { success: false, error: pedidoError.message }
  }

  // Delete existing items and re-insert
  await supabase.from('pedido_itens').delete().eq('pedido_id', id)

  if (itens.length > 0) {
    const itensToInsert = itens.map(item => ({
      pedido_id: id,
      produto_id: item.produto_id,
      quantidade: item.quantidade,
      valor_unitario: item.valor_unitario,
    }))

    const { data: insertedItens, error: itensError } = await supabase
      .from('pedido_itens')
      .insert(itensToInsert)
      .select('id')

    if (itensError || !insertedItens) {
      console.error('Error updating items:', itensError)
      return { success: false, error: 'Erro ao atualizar itens' }
    }

    for (let i = 0; i < itens.length; i++) {
      const item = itens[i]
      const materiais = await resolveItemMateriais(
        supabase,
        item.produto_id,
        item.quantidade,
        item.materiais
      )
      if (materiais.length && insertedItens[i]) {
        const matResult = await addMateriaisAoPedidoItem(insertedItens[i].id, materiais)
        if (!matResult.success) {
          console.error('Error updating item materials:', matResult.error)
        }
      }
    }
  }

  revalidatePath('/dashboard/pedidos')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function updatePedidoStatus(id: string, status: StatusPedido) {
  const supabase = await createAuthenticatedClient()

  if (!statusPermitidos.includes(status)) {
    return { success: false, error: 'Status invalido' }
  }

  const { error } = await supabase
    .from('pedidos')
    .update({ status })
    .eq('id', id)

  if (error) {
    console.error('Error updating status:', error)
    return { success: false, error: error.message }
  }

  revalidatePath('/dashboard/pedidos')
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/estoque')
  return { success: true }
}

export async function gerarLinkAcompanhamentoPedido(
  pedidoId: string
): Promise<GerarLinkAcompanhamentoResult> {
  if (!uuidRegex.test(pedidoId)) {
    return { success: false, error: 'Pedido invalido' }
  }

  const supabase = await createAuthenticatedClient()

  const { data: pedido, error: pedidoError } = await supabase
    .from('pedidos')
    .select('id, cliente_nome, cliente_contato')
    .eq('id', pedidoId)
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
  const slug = await ensureTrackingSlug(supabase, pedido.id)

  // Legacy token link: create the hash row ONLY if none exists yet.
  // This keeps previously sent /acompanhar/[token] links working (no overwrite of token_hash).
  const { data: existingLink } = await supabase
    .from('pedido_acompanhamento_links')
    .select('id')
    .eq('pedido_id', pedido.id)
    .maybeSingle()

  if (!existingLink) {
    const token = createTrackingToken()
    const tokenHash = hashTrackingToken(token)
    const expiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString()

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
      // Do not fail the whole call — the slug link is still usable.
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
    expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
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
    console.error('Error fetching order materials:', error)
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
  const supabase = await createAuthenticatedClient()

  // First delete items
  await supabase.from('pedido_itens').delete().eq('pedido_id', id)

  // Then delete order
  const { error } = await supabase
    .from('pedidos')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting order:', error)
    return { success: false, error: error.message }
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
    console.error('Error fetching products:', produtosError)
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
  if (!query || query.length < 2) return []
  
  const supabase = await createAuthenticatedClient()
  
  const { data, error } = await supabase
    .from('pedidos')
    .select('cliente_nome, cliente_contato, valor_total, data_pedido')
    .ilike('cliente_nome', `%${query}%`)
    .order('data_pedido', { ascending: false })
    .limit(50)

  if (error || !data) {
    console.error('Error searching clients:', error)
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

export async function addMateriaisAoPedidoItem(
  pedidoItemId: string,
  materiais: PedidoItemMaterialInput[]
) {
  const supabase = await createAuthenticatedClient()

  // Remove existing materials first
  await supabase
    .from('pedido_itens_materiais')
    .delete()
    .eq('pedido_item_id', pedidoItemId)

  if (materiais.length === 0) {
    return { success: true }
  }

  // Insert new materials
  const materiaisToInsert = materiais.map(m => ({
    pedido_item_id: pedidoItemId,
    material_id: m.material_id,
    quantidade: m.quantidade,
  }))

  const { error } = await supabase
    .from('pedido_itens_materiais')
    .insert(materiaisToInsert)

  if (error) {
    console.error('Error adding materials to order item:', error)
    return { success: false, error: error.message }
  }

  revalidatePath('/dashboard/pedidos')
  return { success: true }
}

export async function getPedidoItemMateriais(pedidoItemId: string) {
  const supabase = await createAuthenticatedClient()

  const { data, error } = await supabase
    .from('pedido_itens_materiais')
    .select('*, material:materiais(*)')
    .eq('pedido_item_id', pedidoItemId)

  if (error) {
    console.error('Error fetching order item materials:', error)
    return []
  }

  return data
}

// Nova função para criar pedido com componentes customizados
export async function createPedidoCustomizado(params: {
  cliente_nome: string
  cliente_telefone: string | null
  cliente_endereco: string | null
  categoria_id: string
  quantidade_itens: number
  componentes: Array<{ material_id: string; quantidade: number }>
  prazo_entrega: string
  observacoes: string | null
  margem_percentual?: number
}) {
  const supabase = await createAuthenticatedClient()

  try {
    const quantidadeItens = Math.max(1, params.quantidade_itens || 1)
    const validationError = validatePedidoBasico(params.cliente_nome, params.prazo_entrega)

    if (validationError) {
      return { success: false, error: validationError }
    }

    if (quantidadeItens > 10000) {
      return { success: false, error: 'Quantidade de itens invalida' }
    }

    const componentesSelecionados = params.componentes.filter(
      (componente) =>
        componente.material_id &&
        Number.isFinite(componente.quantidade) &&
        componente.quantidade > 0 &&
        componente.quantidade <= 100000
    )

    if (componentesSelecionados.length === 0) {
      return { success: false, error: 'Adicione pelo menos um componente ao pedido' }
    }

    // Get labor configuration
    const { data: maodeobra } = await supabase
      .from('configuracao_maodeobra')
      .select('valor_maodeobra')
      .eq('categoria_id', params.categoria_id)
      .maybeSingle()

    const materialIds = componentesSelecionados.map((componente) => componente.material_id)

    const { data: materiaisData, error: materiaisError } = await supabase
      .from('materiais')
      .select('id, nome, custo_unitario, quantidade, quantidade_atual')
      .in('id', materialIds)

    if (materiaisError || !materiaisData) {
      console.error('Error fetching selected materials:', materiaisError)
      return { success: false, error: 'Erro ao carregar materiais selecionados' }
    }

    // Preco do pedido: custo real de materiais + mao de obra, depois margem no total.
    // O arredondamento entra uma unica vez, no valor final do pedido.

    const margemPercentual = Math.max(0, params.margem_percentual ?? 100)

    let custoMateriaisTotal = 0
    const faltantes: string[] = []

    for (const componente of componentesSelecionados) {
      const material = materiaisData.find((item) => item.id === componente.material_id)
      if (!material) {
        faltantes.push('Material não encontrado')
        continue
      }

      const quantidadeTotal = componente.quantidade * quantidadeItens
      const estoqueAtual = material.quantidade_atual ?? material.quantidade ?? 0

      if (estoqueAtual < quantidadeTotal) {
        faltantes.push(
          `${material.nome}: estoque ${estoqueAtual}, necessário ${quantidadeTotal}`
        )
      }

      const custoUnit = material.custo_unitario || 0
      custoMateriaisTotal += custoUnit * quantidadeTotal
    }

    if (faltantes.length > 0) {
      return {
        success: false,
        error: `Estoque insuficiente: ${faltantes.join(', ')}`,
      }
    }

    const maodeobraTotal = (maodeobra?.valor_maodeobra || 0) * quantidadeItens
    const custoBase = custoMateriaisTotal + maodeobraTotal
    const valorComMargem = custoBase * (1 + margemPercentual / 100)
    const valorTotal = arredondarParaCimaMeioReal(valorComMargem)

    const produtoId = await resolveProdutoIdForCategoria(supabase, params.categoria_id)
    if (!produtoId) {
      return {
        success: false,
        error: 'Cadastre um produto antes de criar pedidos.',
      }
    }

    const { data: pedido, error: pedidoError } = await supabase
      .from('pedidos')
      .insert({
        cliente_nome: params.cliente_nome,
        cliente_contato: params.cliente_telefone,
        prazo_entrega: params.prazo_entrega,
        status: 'separando_materiais',
        prioridade: 1,
        valor_total: valorTotal,
        observacoes: params.observacoes,
        tipo_produto_id: params.categoria_id,
      })
      .select()
      .single()

    if (pedidoError || !pedido) {
      console.error('Error creating order:', pedidoError)
      return { success: false, error: pedidoError?.message || 'Erro ao criar pedido' }
    }

    const { data: pedidoItem, error: itemError } = await supabase
      .from('pedido_itens')
      .insert({
        pedido_id: pedido.id,
        produto_id: produtoId,
        quantidade: quantidadeItens,
        valor_unitario: valorTotal / quantidadeItens,
      })
      .select()
      .single()

    if (itemError || !pedidoItem) {
      console.error('Error creating order item:', itemError)
      await supabase.from('pedidos').delete().eq('id', pedido.id)
      return { success: false, error: 'Erro ao adicionar item' }
    }

    const materiais = componentesSelecionados.map((c) => ({
      pedido_item_id: pedidoItem.id,
      material_id: c.material_id,
      quantidade: c.quantidade * quantidadeItens,
    }))

    const { error: matError } = await supabase
      .from('pedido_itens_materiais')
      .insert(materiais)

    if (matError) {
      console.error('Error adding materials:', matError)
      await supabase.from('pedido_itens').delete().eq('id', pedidoItem.id)
      await supabase.from('pedidos').delete().eq('id', pedido.id)
      return { success: false, error: 'Erro ao adicionar materiais' }
    }

    revalidatePath('/dashboard/pedidos')
    revalidatePath('/dashboard')
    revalidatePath('/dashboard/estoque')
    return { success: true, pedidoId: pedido.id }
  } catch (error) {
    console.error('Error creating customized order:', error)
    return { success: false, error: 'Erro ao criar pedido customizado' }
  }
}

// Função para trazer dados necessários para o form de pedido
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
      console.error('Error fetching categories:', catError)
      return { categorias: [], grupos: [], componentes: [], maodeobra: {} }
    }

    // Get all component groups
    const { data: grupos, error: grupoError } = await supabase
      .from('grupos_componentes')
      .select('*')
      .eq('ativo', true)
      .order('ordem')

    if (grupoError) {
      console.error('Error fetching groups:', grupoError)
    }

    // Get all components with materials
    const { data: componentes, error: compError } = await supabase
      .from('componentes_estoque')
      .select('*, material:materiais(*)')
      .eq('ativo', true)
      .order('ordem')

    if (compError) {
      console.error('Error fetching components:', compError)
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
    console.error('Error fetching form data:', error)
    return { categorias: [], grupos: [], componentes: [], maodeobra: {} }
  }
}
