'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createAuthenticatedClient } from '@/lib/auth'
import { logServerError } from '@/lib/server-log'
import { isFiniteNumberInRange, isValidUuid } from '@/lib/security/input'

function parseCurrencyBR(value: FormDataEntryValue | null) {
  const raw = String(value ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(/R\$/gi, '')

  if (!raw) return Number.NaN

  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw

  return Number(normalized)
}

function redirectWithError(pedidoId: string, message: string): never {
  redirect(`/dashboard/pedidos/${pedidoId}/valor?error=${encodeURIComponent(message)}`)
}

export async function atualizarValorPedidoManual(formData: FormData) {
  const pedidoId = String(formData.get('pedido_id') ?? '')
  const valorTotal = parseCurrencyBR(formData.get('valor_total'))

  if (!isValidUuid(pedidoId)) {
    redirect('/dashboard/pedidos?error=Pedido%20invalido')
  }

  if (!isFiniteNumberInRange(valorTotal, 0, 9_999_999)) {
    redirectWithError(pedidoId, 'Informe um valor valido para o pedido.')
  }

  const valorTotalNormalizado = Math.round(valorTotal * 100) / 100
  const supabase = await createAuthenticatedClient()

  const { data: pedido, error: pedidoError } = await supabase
    .from('pedidos')
    .select('id')
    .eq('id', pedidoId)
    .eq('ativo', true)
    .maybeSingle()

  if (pedidoError || !pedido) {
    logServerError('pedidos_manual_total_lookup_failed', pedidoError, { pedidoId })
    redirectWithError(pedidoId, 'Pedido nao encontrado.')
  }

  const { data: itens, error: itensError } = await supabase
    .from('pedido_itens')
    .select('id, quantidade')
    .eq('pedido_id', pedidoId)

  if (itensError || !itens || itens.length === 0) {
    logServerError('pedidos_manual_total_items_failed', itensError, { pedidoId })
    redirectWithError(pedidoId, 'Nao foi possivel carregar os itens do pedido.')
  }

  const quantidadeTotal = itens.reduce((acc, item) => acc + Number(item.quantidade || 0), 0)

  if (!Number.isFinite(quantidadeTotal) || quantidadeTotal <= 0) {
    redirectWithError(pedidoId, 'Quantidade do pedido invalida.')
  }

  const valorUnitario = Math.round((valorTotalNormalizado / quantidadeTotal) * 100) / 100

  const { error: updateItensError } = await supabase
    .from('pedido_itens')
    .update({ valor_unitario: valorUnitario })
    .eq('pedido_id', pedidoId)

  if (updateItensError) {
    logServerError('pedidos_manual_total_update_items_failed', updateItensError, { pedidoId })
    redirectWithError(pedidoId, 'Nao foi possivel atualizar os itens do pedido.')
  }

  // Mantem o total do pedido exatamente como informado. O valor unitario pode arredondar
  // quando a quantidade nao divide o total em centavos exatos.
  const { error: updatePedidoError } = await supabase
    .from('pedidos')
    .update({ valor_total: valorTotalNormalizado })
    .eq('id', pedidoId)
    .eq('ativo', true)

  if (updatePedidoError) {
    logServerError('pedidos_manual_total_update_pedido_failed', updatePedidoError, { pedidoId })
    redirectWithError(pedidoId, 'Nao foi possivel atualizar o valor do pedido.')
  }

  revalidatePath('/dashboard/pedidos')
  revalidatePath('/dashboard')
  revalidatePath('/p/[slug]', 'page')
  revalidatePath('/acompanhar/[token]', 'page')

  redirect('/dashboard/pedidos')
}
