export const BUSINESS_TIME_ZONE = 'America/Sao_Paulo'

export function getBusinessYearMonth(date: Date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(date)

  const year = Number(parts.find((part) => part.type === 'year')?.value)
  const month = Number(parts.find((part) => part.type === 'month')?.value)

  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    throw new Error('Nao foi possivel determinar o mes comercial')
  }

  return {
    ano: year,
    mes: month - 1,
  }
}

export function formatBusinessMonth(date: Date = new Date()) {
  return date.toLocaleDateString('pt-BR', {
    timeZone: BUSINESS_TIME_ZONE,
    month: 'long',
    year: 'numeric',
  })
}
