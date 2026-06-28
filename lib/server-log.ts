type LogDetails = Record<string, unknown>

const SENSITIVE_KEY_PATTERN =
  /(authorization|cookie|password|secret|token|telefone|phone|contato|email)/i

function sanitizeValue(value: unknown, key = ''): unknown {
  if (SENSITIVE_KEY_PATTERN.test(key)) return '[redacted]'
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return value.slice(0, 240)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.slice(0, 10).map((item) => sanitizeValue(item))
  return '[object]'
}

function sanitizeDetails(details?: LogDetails) {
  if (!details) return undefined

  return Object.fromEntries(
    Object.entries(details).map(([key, value]) => [key, sanitizeValue(value, key)]),
  )
}

export function getSafeError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return { message: String(error ?? 'unknown error') }
  }

  const record = error as {
    name?: string
    code?: string
    status?: number
    message?: string
  }

  return {
    name: record.name,
    code: record.code,
    status: record.status,
    message: record.message?.slice(0, 240) ?? 'unknown error',
  }
}

export function logServerInfo(event: string, details?: LogDetails) {
  console.info('[exclusivart-prod]', event, sanitizeDetails(details) ?? {})
}

export function logServerError(event: string, error: unknown, details?: LogDetails) {
  console.error('[exclusivart-prod]', event, {
    ...sanitizeDetails(details),
    error: getSafeError(error),
  })
}
