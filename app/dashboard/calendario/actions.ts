'use server'

import { createAuthenticatedClient } from '@/lib/auth'
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
    .in('status', ['orcamento', 'confirmado', 'em_producao', 'pronto'])
    .order('prazo_entrega', { ascending: true })

  if (error) {
    console.error('Error fetching orders:', error)
    return []
  }

  return data || []
}
