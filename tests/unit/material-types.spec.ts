import { expect, test } from '@playwright/test'
import { getCanonicalMaterialType, MATERIAL_TYPES } from '../../lib/material-types'

test('mantem apenas os seis tipos de materiais permitidos', () => {
  expect(MATERIAL_TYPES.map((tipo) => tipo.nome)).toEqual([
    'Contas',
    'Entremeio',
    'Cruz',
    'Letras',
    'Linhas',
    'Embalagem',
  ])
})

test('normaliza os tipos detalhados antigos sem perder a classificacao principal', () => {
  expect(getCanonicalMaterialType('CONTAS LEITOSAS')).toBe('Contas')
  expect(getCanonicalMaterialType('CONTAS CRAQUELADAS')).toBe('Contas')
  expect(getCanonicalMaterialType('CONTA EMBORRACHADA')).toBe('Contas')
  expect(getCanonicalMaterialType('LINHA')).toBe('Linhas')
  expect(getCanonicalMaterialType('EMBALAGEM')).toBe('Embalagem')
})

test('rejeita tipos fora da lista padronizada', () => {
  expect(getCanonicalMaterialType('Tipo inventado')).toBeNull()
})
