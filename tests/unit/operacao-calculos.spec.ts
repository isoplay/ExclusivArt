import { expect, test } from '@playwright/test'
import {
  buildOrderMaterialDemand,
  buildStockAlerts,
  calculatePricing,
  getDaysUntil,
  getEstoqueAtual,
} from '../../lib/operacao-calculos'

test('agrega demanda em lote e prioriza materiais personalizados', () => {
  expect(
    buildOrderMaterialDemand([
      {
        quantidade: 3,
        materiais_personalizados: [{ material_id: 'mat-custom', quantidade: 5 }],
        materiais_produto: [{ material_id: 'mat-padrao', quantidade: 2 }],
      },
      {
        quantidade: 2,
        materiais_produto: [{ material_id: 'mat-padrao', quantidade: 2 }],
      },
    ])
  ).toEqual([
    { material_id: 'mat-custom', quantidade: 5 },
    { material_id: 'mat-padrao', quantidade: 4 },
  ])
})

test('calcula estoque atual usando quantidade_atual quando existir', () => {
  expect(
    getEstoqueAtual({
      id: 'mat-1',
      nome: 'Conta azul',
      quantidade: 40,
      quantidade_atual: 12,
    })
  ).toBe(12)
})

test('gera alerta critico quando pedido aberto passa do estoque', () => {
  const [alerta] = buildStockAlerts(
    [
      {
        id: 'mat-1',
        nome: 'Conta azul',
        quantidade_atual: 10,
        quantidade_minima: 5,
        custo_unitario: 0.2,
        unidade: 'un',
      },
    ],
    [{ material_id: 'mat-1', quantidade: 18 }]
  )

  expect(alerta.nivel).toBe('critico')
  expect(alerta.falta).toBe(8)
  expect(alerta.custo_reposicao).toBeCloseTo(1.6)
})

test('calcula preco sugerido considerando margem e taxa', () => {
  const resultado = calculatePricing({
    materialCost: 12,
    laborCost: 8,
    packagingCost: 2,
    marketplaceFeePercent: 10,
    freightCost: 3,
    marginPercent: 40,
  })

  expect(resultado.custo_base).toBe(25)
  expect(resultado.preco_sugerido).toBeCloseTo(50)
})

test('calcula dias ate prazo sem horario influenciar', () => {
  const dias = getDaysUntil('2026-06-08', new Date('2026-06-05T15:30:00Z'))

  expect(dias).toBe(3)
})
