import { expect, test } from '@playwright/test'
import {
  canTransitionOrcamentoStatus,
  parseOrcamentoPayload,
  parsePublicOrcamento,
} from '../../lib/orcamentos/validation'

function manualPayload() {
  return {
    cliente_nome: 'Cliente Teste',
    margem_percentual: 100,
    itens: [
      {
        nome_produto: 'Peça personalizada',
        quantidade: 1,
        mao_obra_unitaria: 15,
        componentes: [
          {
            grupo_nome: 'Acabamento',
            material_nome: 'Material sob encomenda',
            quantidade_por_item: 2,
            unidade: 'un',
            custo_unitario_estimado: 4.5,
            origem: 'manual',
          },
        ],
      },
    ],
  }
}

function publicPayload() {
  return {
    cliente_nome: 'Cliente Teste',
    orcamento_codigo: 'EXO-2026-12345678',
    status: 'enviado',
    validade: '2026-07-10',
    prazo_estimado: null,
    quantidade_total: 1,
    valor_total: 48,
    observacao_cliente: 'Produção após confirmação.',
    created_at: '2026-06-28T12:00:00.000Z',
    itens: [
      {
        nome_produto: 'Peça personalizada',
        quantidade: 1,
        valor_total: 48,
        componentes: [
          {
            grupo_nome: 'Acabamento',
            material_nome: 'Material sob encomenda',
            quantidade_por_item: 2,
            unidade: 'un',
            cor_hex: null,
            origem: 'manual',
          },
        ],
      },
    ],
  }
}

test('aceita orçamento com componente manual válido', () => {
  expect(parseOrcamentoPayload(manualPayload()).success).toBe(true)
})

test('exige material existente quando a origem é estoque', () => {
  const payload = manualPayload()
  payload.itens[0].componentes[0].origem = 'estoque'

  const parsed = parseOrcamentoPayload(payload)

  expect(parsed.success).toBe(false)
  if (!parsed.success) {
    expect(parsed.error).toMatch(/material do estoque/i)
  }
})

test('rejeita unidade, cor e URL fora dos formatos permitidos', () => {
  for (const invalidComponent of [
    { unidade: 'litro' },
    { cor_hex: 'roxo' },
    { imagem_url: 'javascript:alert(1)' },
  ]) {
    const payload = manualPayload()
    Object.assign(payload.itens[0].componentes[0], invalidComponent)
    expect(parseOrcamentoPayload(payload).success).toBe(false)
  }
})

test('bloqueia mais de 200 componentes no orçamento', () => {
  const payload = manualPayload()
  payload.itens = Array.from({ length: 5 }, (_, itemIndex) => ({
    ...payload.itens[0],
    nome_produto: `Produto ${itemIndex + 1}`,
    componentes: Array.from({ length: 41 }, (_, componentIndex) => ({
      ...payload.itens[0].componentes[0],
      material_nome: `Material ${itemIndex + 1}-${componentIndex + 1}`,
    })),
  }))

  expect(parseOrcamentoPayload(payload).success).toBe(false)
})

test('mantém convertido como estado terminal', () => {
  expect(canTransitionOrcamentoStatus('rascunho', 'enviado')).toBe(true)
  expect(canTransitionOrcamentoStatus('enviado', 'aprovado')).toBe(true)
  expect(canTransitionOrcamentoStatus('convertido', 'rascunho')).toBe(false)
})

test('payload público não aceita campos internos', () => {
  expect(parsePublicOrcamento(publicPayload())).not.toBeNull()
  expect(
    parsePublicOrcamento({
      ...publicPayload(),
      custo_total: 24,
      margem_percentual: 100,
      observacoes_internas: 'Não pode aparecer.',
    })
  ).toBeNull()
})
