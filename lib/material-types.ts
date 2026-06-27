export const MATERIAL_TYPES = [
  { nome: 'Contas', ordem: 1 },
  { nome: 'Entremeio', ordem: 2 },
  { nome: 'Cruz', ordem: 3 },
  { nome: 'Letras', ordem: 4 },
  { nome: 'Linhas', ordem: 5 },
  { nome: 'Embalagem', ordem: 6 },
] as const

export type MaterialTypeName = (typeof MATERIAL_TYPES)[number]['nome']

export function normalizeMaterialTypeKey(value: string | null | undefined) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

export function getCanonicalMaterialType(
  value: string | null | undefined
): MaterialTypeName | null {
  const key = normalizeMaterialTypeKey(value)

  if (
    key === 'conta' ||
    key === 'contas' ||
    key.startsWith('conta ') ||
    key.startsWith('contas ')
  ) {
    return 'Contas'
  }

  if (key === 'entremeio' || key === 'pingente' || key === 'medalha' || key === 'fecho') {
    return 'Entremeio'
  }

  if (key === 'cruz' || key === 'crucifixo') {
    return 'Cruz'
  }

  if (key === 'letra' || key === 'letras') {
    return 'Letras'
  }

  if (key === 'linha' || key === 'linhas' || key === 'fio' || key === 'fios') {
    return 'Linhas'
  }

  if (key === 'embalagem' || key === 'embalagens') {
    return 'Embalagem'
  }

  return null
}
