import type { Metadata } from 'next'
import { createPublicClient } from '@/lib/supabase/public'
import { logServerError } from '@/lib/server-log'
import type { PedidoAcompanhamentoPublico, StatusPedido } from '@/lib/types/database'
import {
  OrderTrackingPreview,
  OrderTrackingUnavailable,
  type OrderTrackingData,
} from '@/components/acompanhamento-pedido/order-tracking-preview'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
  title: 'Acompanhamento do Pedido | Exclusiv ART',
  description: 'Pagina publica de acompanhamento de pedido da Exclusiv ART.',
}

type AcompanharPedidoSlugPageProps = {
  params: Promise<{ slug: string }>
}

function isValidTrackingSlug(slug: string) {
  // Short slugs produced by createTrackingSlug + safe fallback range
  return /^[A-Za-z0-9_-]{8,64}$/.test(slug)
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

function formatDateLong(value: string | null) {
  if (!value) return 'A combinar'

  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return 'A combinar'

  return new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, day))
}

function formatQuantity(value: number) {
  const quantity = Number.isFinite(Number(value)) ? Number(value) : 0
  return `${quantity} ${quantity === 1 ? 'unidade' : 'unidades'}`
}

function getStatusMessage(status: StatusPedido) {
  const messages: Record<StatusPedido, string> = {
    orcamento: 'Seu pedido está em fase de orçamento e conferência dos detalhes.',
    confirmado: 'Seu pedido foi confirmado e já está na nossa fila de produção.',
    separando_materiais: 'Estamos separando os materiais para preparar sua peça com cuidado.',
    em_producao:
      'Seu pedido está sendo produzido com atenção aos detalhes. Assim que estiver pronto, avisaremos você pelo WhatsApp.',
    pronto:
      'Seu pedido está pronto para entrega. Em breve combinaremos os detalhes pelo WhatsApp.',
    entregue: 'Seu pedido foi entregue. Obrigada por confiar no trabalho da Exclusiv ART.',
    cancelado:
      'Este pedido foi cancelado. Se precisar de ajuda, fale com a Exclusiv ART pelo WhatsApp.',
  }

  return messages[status] ?? messages.orcamento
}

function mapTrackingData(payload: PedidoAcompanhamentoPublico): OrderTrackingData {
  return {
    customerName: payload.cliente_nome,
    orderCode: payload.pedido_codigo,
    status: payload.status,
    expectedDate: formatDateLong(payload.prazo_entrega),
    product: payload.produto_resumo,
    quantity: formatQuantity(payload.quantidade_total),
    totalValue: formatCurrency(Number(payload.valor_total ?? 0)),
    message: getStatusMessage(payload.status),
  }
}

async function getTrackingDataBySlug(slug: string) {
  if (!isValidTrackingSlug(slug)) {
    return null
  }

  try {
    const supabase = createPublicClient()
    const { data, error } = await supabase.rpc('get_public_pedido_acompanhamento_by_slug', {
      p_slug: slug,
    })

    if (error) {
      logServerError('public_tracking_by_slug_rpc_failed', error, {
        route: '/p/[slug]',
      })
      return null
    }

    if (!data) {
      return null
    }

    return mapTrackingData(data as PedidoAcompanhamentoPublico)
  } catch (error) {
    logServerError('public_tracking_by_slug_exception', error, {
      route: '/p/[slug]',
    })
    return null
  }
}

export default async function AcompanharPedidoBySlugPage({
  params,
}: AcompanharPedidoSlugPageProps) {
  const { slug } = await params
  const order = await getTrackingDataBySlug(slug)

  if (!order) {
    return <OrderTrackingUnavailable />
  }

  return <OrderTrackingPreview order={order} />
}
