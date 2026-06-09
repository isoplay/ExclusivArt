export function parseDecimalInput(
  raw: FormDataEntryValue | string | number | null | undefined
) {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : 0
  }

  const value = String(raw ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(/[^\d,.-]/g, '')

  if (!value || value === '-') return 0

  const sign = value.startsWith('-') ? '-' : ''
  const unsigned = value.replace(/-/g, '')
  const commaIndex = unsigned.lastIndexOf(',')
  const dotIndex = unsigned.lastIndexOf('.')
  const decimalSeparator = getDecimalSeparator(unsigned, commaIndex, dotIndex)

  if (!decimalSeparator) {
    // Sem separador decimal, ponto e virgula entram como marcadores de milhar.
    const number = Number(`${sign}${unsigned.replace(/[,.]/g, '')}`)
    return Number.isFinite(number) ? number : 0
  }

  const decimalIndex = unsigned.lastIndexOf(decimalSeparator)
  const integerPart = unsigned.slice(0, decimalIndex).replace(/[,.]/g, '') || '0'
  const decimalPart = unsigned.slice(decimalIndex + 1).replace(/[,.]/g, '')
  const number = Number(`${sign}${integerPart}.${decimalPart}`)

  return Number.isFinite(number) ? number : 0
}

export function roundDecimal(value: number, decimals: number) {
  if (!Number.isFinite(value)) return 0

  const factor = 10 ** decimals
  return Math.round((value + Number.EPSILON) * factor) / factor
}

export function roundCurrency(value: number) {
  return roundDecimal(value, 2)
}

export function areDecimalValuesClose(value: number, comparison: number, decimals = 4) {
  const tolerance = 1 / 10 ** decimals
  return Math.abs(value - comparison) < tolerance
}

function getDecimalSeparator(value: string, commaIndex: number, dotIndex: number) {
  if (commaIndex >= 0 && dotIndex >= 0) {
    // Em entradas como "1.234,56" e "1,234.56", o ultimo separador e o decimal.
    return commaIndex > dotIndex ? ',' : '.'
  }

  if (commaIndex >= 0) {
    return isThousandsOnly(value, ',') ? null : ','
  }

  if (dotIndex >= 0) {
    return isThousandsOnly(value, '.') ? null : '.'
  }

  return null
}

function isThousandsOnly(value: string, separator: ',' | '.') {
  const parts = value.split(separator)
  if (parts.length <= 1) return false

  if (parts.length === 2) {
    return parts[0] !== '0' && parts[1].length === 3
  }

  return parts.slice(1).every((part) => part.length === 3)
}
