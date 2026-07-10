import type { Metadata } from 'next'
import { createPublicClient } from '@/lib/supabase/public'
import { logServerError } from '@/lib/server-log'
import { BRAND_NAME } from '@/lib/brand'
import type { PedidoAcompanhamentoPublico, StatusPedido } from '@/lib/types/database'
import {
  isValidPublicToken,
  parsePublicTrackingPayload,
} from '@/lib/public-tracking-validation'
import {
  OrderTrackingPreview,
  OrderTrackingUnavailable,
  type OrderTrackingData,
} from '@/components/acompanhamento-pedido/order-tracking-preview'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
  title: `Acompanhamento do Pedido | ${BRAND_NAME}`,
  description: `Página pública de acompanhamento de pedido da ${BRAND_NAME}.`,
  robots: {
    index: false,
    follow: false,
  },
}

type AcompanharPedidoPageProps = {
  params: Promise<{ token: string }>
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
    orcamento: 'Seu pedido está em conferência inicial dos detalhes.',
    confirmado: 'Seu pedido foi confirmado e já está na nossa fila de produção.',
    separando_materiais: 'Estamos separando os materiais para preparar sua peça com cuidado.',
    em_producao:
      'Seu pedido está sendo produzido com atenção aos detalhes. Assim que estiver pronto, avisaremos você pelo WhatsApp.',
    pronto:
      'Seu pedido está pronto para entrega. Em breve combinaremos os detalhes pelo WhatsApp.',
    entregue: `Seu pedido foi entregue. Obrigada por confiar no trabalho da ${BRAND_NAME}.`,
    cancelado:
      `Este pedido foi cancelado. Se precisar de ajuda, fale com a ${BRAND_NAME} pelo WhatsApp.`,
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
    customerNote: payload.observacao_cliente || null,
    message: getStatusMessage(payload.status),
  }
}

async function getTrackingData(token: string) {
  if (!isValidPublicToken(token)) {
    return null
  }

  try {
    const supabase = createPublicClient()
    const { data, error } = await supabase.rpc('get_public_pedido_acompanhamento', {
      p_token: token,
    })

    if (error) {
      logServerError('public_tracking_rpc_failed', error, {
        route: '/acompanhar/[token]',
      })
      return null
    }

    const payload = parsePublicTrackingPayload(data)
    if (!payload) {
      if (data) {
        logServerError(
          'public_tracking_payload_invalid',
          new Error('Public tracking payload does not match the expected schema'),
          { route: '/acompanhar/[token]' }
        )
      }
      return null
    }

    return mapTrackingData(payload)
  } catch (error) {
    logServerError('public_tracking_exception', error, {
      route: '/acompanhar/[token]',
    })
    return null
  }
}

export default async function AcompanharPedidoPage({
  params,
}: AcompanharPedidoPageProps) {
  const { token } = await params
  const order = await getTrackingData(token)

  if (!order) {
    return <OrderTrackingUnavailable />
  }

  return <OrderTrackingPreview order={order} />
}
