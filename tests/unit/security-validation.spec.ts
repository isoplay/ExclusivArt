import { expect, test } from '@playwright/test'
import {
  escapePostgrestSearch,
  isFiniteNumberInRange,
  isValidDateOnly,
  isValidUuid,
  normalizeSingleLine,
} from '../../lib/security/input'
import {
  isValidPublicSlug,
  isValidPublicToken,
  parsePublicTrackingPayload,
} from '../../lib/public-tracking-validation'

const validTrackingPayload = {
  cliente_nome: 'Cliente Teste',
  pedido_codigo: 'EXA-2026-A1B2C3D4',
  status: 'confirmado',
  prazo_entrega: '2026-07-20',
  produto_resumo: 'Peça personalizada',
  quantidade_total: 2,
  valor_total: 120,
  observacao_cliente: null,
  data_pedido: '2026-06-28T12:00:00.000Z',
}

test('valida UUID antes de actions privadas consultarem o banco', () => {
  expect(isValidUuid('a09cc7f6-1da1-4710-a03d-4eb029f98124')).toBe(true)
  expect(isValidUuid('1 OR 1=1')).toBe(false)
  expect(isValidUuid('../pedido')).toBe(false)
})

test('rejeita textos longos, datas impossíveis e números não finitos', () => {
  expect(normalizeSingleLine('  Cliente   Teste  ', 30)).toBe('Cliente Teste')
  expect(normalizeSingleLine('x'.repeat(31), 30)).toBeNull()
  expect(isValidDateOnly('2026-02-29')).toBe(false)
  expect(isFiniteNumberInRange(Number.POSITIVE_INFINITY, 0, 100)).toBe(false)
  expect(isFiniteNumberInRange(Number.NaN, 0, 100)).toBe(false)
})

test('restringe formato e tamanho de slugs e tokens públicos', () => {
  expect(isValidPublicSlug('EXA-AbCdEf123456')).toBe(true)
  expect(isValidPublicSlug('curto')).toBe(false)
  expect(isValidPublicSlug('../segredo')).toBe(false)
  expect(isValidPublicToken('A'.repeat(43))).toBe(true)
  expect(isValidPublicToken('A'.repeat(31))).toBe(false)
})

test('payload público recusa status inválido e qualquer campo interno', () => {
  expect(parsePublicTrackingPayload(validTrackingPayload)).not.toBeNull()
  expect(
    parsePublicTrackingPayload({ ...validTrackingPayload, status: 'admin' })
  ).toBeNull()
  expect(
    parsePublicTrackingPayload({
      ...validTrackingPayload,
      custo_total: 20,
      material_id: 'a09cc7f6-1da1-4710-a03d-4eb029f98124',
    })
  ).toBeNull()
})

test('escapa metacaracteres usados por filtros PostgREST', () => {
  expect(escapePostgrestSearch('ana%,admin.eq.true')).toBe(
    'ana\\%\\,admin\\.eq\\.true'
  )
})
