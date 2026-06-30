import { expect, test } from '@playwright/test'
import {
  getCanonicalMaterialType,
  isColorDrivenMaterialType,
  MATERIAL_TYPES,
} from '../../lib/material-types'

test('mantem os seis tipos padrao disponiveis', () => {
  expect(MATERIAL_TYPES.map((tipo) => tipo.nome)).toEqual([
    'Contas',
    'Entremeio',
    'Cruz',
    'Letras',
    'Linhas',
    'Embalagem',
  ])
})

test('preserva tipos detalhados de contas', () => {
  expect(getCanonicalMaterialType('  Contas   leitosas  ')).toBe('Contas leitosas')
  expect(getCanonicalMaterialType('Contas craqueladas')).toBe('Contas craqueladas')
  expect(getCanonicalMaterialType('Conta emborrachada')).toBe('Conta emborrachada')
  expect(getCanonicalMaterialType('LINHA')).toBe('Linhas')
  expect(getCanonicalMaterialType('EMBALAGEM')).toBe('Embalagem')
})

test('permite tipos personalizados validos', () => {
  expect(getCanonicalMaterialType('Pedras naturais')).toBe('Pedras naturais')
  expect(getCanonicalMaterialType('')).toBeNull()
})

test('usa cor em qualquer tipo de conta', () => {
  expect(isColorDrivenMaterialType('Contas')).toBe(true)
  expect(isColorDrivenMaterialType('Contas craqueladas')).toBe(true)
  expect(isColorDrivenMaterialType('Conta leitosa')).toBe(true)
  expect(isColorDrivenMaterialType('Entremeio')).toBe(false)
})
