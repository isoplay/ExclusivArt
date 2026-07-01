import { expect, test } from '@playwright/test'
import { getBusinessYearMonth } from '../../lib/business-time'

test('mantem o mes anterior ate meia-noite em Sao Paulo', () => {
  const beforeMidnight = new Date('2026-07-01T02:59:59.999Z')

  expect(getBusinessYearMonth(beforeMidnight)).toEqual({
    ano: 2026,
    mes: 5,
  })
})

test('vira o mes exatamente a meia-noite em Sao Paulo', () => {
  const midnight = new Date('2026-07-01T03:00:00.000Z')

  expect(getBusinessYearMonth(midnight)).toEqual({
    ano: 2026,
    mes: 6,
  })
})
