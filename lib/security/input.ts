export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

export function normalizeSingleLine(value: unknown, maxLength: number) {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ')
  if (!text || text.length > maxLength) return null
  return text
}

export function normalizeMultiline(value: unknown, maxLength: number) {
  const text = String(value ?? '').trim()
  if (!text || text.length > maxLength) return null
  return text
}

export function isValidDateOnly(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.toISOString().slice(0, 10) === value
}

export function isFiniteNumberInRange(value: unknown, minimum: number, maximum: number) {
  const number = Number(value)
  return Number.isFinite(number) && number >= minimum && number <= maximum
}

export function escapePostgrestSearch(value: string) {
  return value.replace(/[\\%_,().]/g, (character) => `\\${character}`)
}
