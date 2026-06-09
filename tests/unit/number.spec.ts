import { expect, test } from '@playwright/test'
import { areDecimalValuesClose, parseDecimalInput, roundCurrency } from '../../lib/number'

test('converte valores brasileiros e americanos com centavos', () => {
  expect(parseDecimalInput('0,15')).toBe(0.15)
  expect(parseDecimalInput('0.15')).toBe(0.15)
  expect(parseDecimalInput('1.234,56')).toBe(1234.56)
  expect(parseDecimalInput('1,234.56')).toBe(1234.56)
})

test('arredonda dinheiro antes de salvar no banco', () => {
  expect(roundCurrency(0.1 * 3)).toBe(0.3)
  expect(roundCurrency(1.005)).toBe(1.01)
})

test('compara custo unitario usando tolerancia decimal', () => {
  expect(areDecimalValuesClose(0.2, 0.20004, 4)).toBe(true)
  expect(areDecimalValuesClose(0.2, 0.201, 4)).toBe(false)
})
