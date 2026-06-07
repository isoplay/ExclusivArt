import type { Metadata } from 'next'
import {
  OrderTrackingPreview,
  type OrderTrackingData,
} from '@/components/acompanhamento-pedido/order-tracking-preview'

export const metadata: Metadata = {
  title: 'Preview Pronto para Entrega | Exclusiv ART',
  description: 'Previa visual do acompanhamento de pedido pronto para entrega.',
}

const previewOrder: OrderTrackingData = {
  customerName: 'Cliente Exclusiv ART',
  orderCode: 'EXA-PREVIEW',
  status: 'pronto',
  expectedDate: '12 de junho de 2026',
  product: 'Terço personalizado',
  quantity: '10 unidades',
  totalValue: 'R$ 120,00',
  message:
    'Seu pedido está pronto para entrega. Em breve combinaremos os detalhes pelo WhatsApp.',
}

export default function PreviewProntoPage() {
  return <OrderTrackingPreview order={previewOrder} />
}
