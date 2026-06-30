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
): string | null {
  const nome = String(value ?? '').trim().replace(/\s+/g, ' ')
  if (!nome || nome.length > 60 || /[\u0000-\u001f\u007f]/.test(nome)) {
    return null
  }

  const key = normalizeMaterialTypeKey(value)

  if (key === 'conta' || key === 'contas') {
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

  return nome
}

export function isStandardMaterialType(value: string | null | undefined) {
  const key = normalizeMaterialTypeKey(value)
  return MATERIAL_TYPES.some((tipo) => normalizeMaterialTypeKey(tipo.nome) === key)
}

export function isColorDrivenMaterialType(value: string | null | undefined) {
  return /^contas?(?:\s|$)/.test(normalizeMaterialTypeKey(value))
}
