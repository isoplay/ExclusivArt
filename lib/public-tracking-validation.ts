import { z } from 'zod'
import type { PedidoAcompanhamentoPublico } from '@/lib/types/database'

export const PUBLIC_SLUG_PATTERN = /^[A-Za-z0-9_-]{8,64}$/
export const PUBLIC_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/

export function isValidPublicSlug(value: unknown): value is string {
  return typeof value === 'string' && PUBLIC_SLUG_PATTERN.test(value)
}

export function isValidPublicToken(value: unknown): value is string {
  return typeof value === 'string' && PUBLIC_TOKEN_PATTERN.test(value)
}

const statusPedidoSchema = z.enum([
  'orcamento',
  'separando_material',
  'em_producao',
  'pronto',
  'pago',
  'pago_entregue',
  'entregue',
  'cancelado',
])

const publicTrackingSchema = z
  .object({
    cliente_nome: z.string().trim().min(1).max(120),
    pedido_codigo: z.string().trim().min(1).max(40),
    status: statusPedidoSchema,
    prazo_entrega: z.string().date().nullable(),
    produto_resumo: z.string().trim().min(1).max(500),
    quantidade_total: z.coerce.number().int().min(0).max(1_000_000),
    valor_total: z.coerce.number().finite().min(0).max(9_999_999_999),
    observacao_cliente: z.string().trim().max(1200).nullable(),
    data_pedido: z.string().datetime({ offset: true }),
  })
  .strict()

export function parsePublicTrackingPayload(input: unknown): PedidoAcompanhamentoPublico | null {
  const parsed = publicTrackingSchema.safeParse(input)
  return parsed.success ? parsed.data : null
}
