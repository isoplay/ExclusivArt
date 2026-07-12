'use server'

import { createAuthenticatedClient } from '@/lib/auth'
import { logServerError } from '@/lib/server-log'
import type { Pedido } from '@/lib/types/database'

export type PedidoCalendario = Pick<
  Pedido,
  'id' | 'cliente_nome' | 'cliente_contato' | 'prazo_entrega' | 'status' | 'valor_total'
>

export async function getPedidosComEntrega(): Promise<PedidoCalendario[]> {
  const supabase = await createAuthenticatedClient()

  const { data, error } = await supabase
    .from('pedidos')
    .select('id, cliente_nome, cliente_contato, prazo_entrega, status, valor_total')
    .eq('ativo', true)
    .not('prazo_entrega', 'is', null)
    .in('status', ['orcamento', 'separando_material', 'em_producao', 'pronto', 'pago'])
    .order('prazo_entrega', { ascending: true })
    .limit(500)

  if (error) {
    logServerError('calendario_get_orders_failed', error, { table: 'pedidos' })
    return []
  }

  return data || []
}
