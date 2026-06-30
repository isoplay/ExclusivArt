import { Box, Circle, Cross, Gem, Medal } from 'lucide-react'
import { isColorDrivenMaterialType } from '@/lib/material-types'
import { cn } from '@/lib/utils'

type MaterialAvatarProps = {
  imageUrl?: string | null
  color?: string | null
  tipo?: string | null
  nome?: string | null
  className?: string
}

function normalizeKey(value: string | null | undefined) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function isValidHexColor(color?: string | null) {
  return /^#[0-9a-fA-F]{3,8}$/.test(String(color ?? '').trim())
}

function getSafeImageUrl(imageUrl?: string | null) {
  const value = String(imageUrl ?? '').trim()
  if (!value) return null
  if (/\.svg(?:$|[?#])/i.test(value)) return null

  if (value.startsWith('/') && !value.startsWith('//')) {
    return value
  }

  try {
    const url = new URL(value)
    if (url.protocol === 'http:' || url.protocol === 'https:') return value
  } catch {
    return null
  }

  return null
}

function FallbackIcon({ tipo, nome }: Pick<MaterialAvatarProps, 'tipo' | 'nome'>) {
  const key = normalizeKey(tipo)

  if (key.includes('cruz') || key.includes('crucifixo')) {
    return <Cross className="h-3 w-3" aria-hidden />
  }

  if (key.includes('medalha')) {
    return <Medal className="h-3 w-3" aria-hidden />
  }

  if (key.includes('entremeio') || key.includes('pingente')) {
    return <Gem className="h-3 w-3" aria-hidden />
  }

  if (key.includes('letra')) {
    const firstLetter = String(nome || 'A').trim().charAt(0).toUpperCase() || 'A'
    return <span className="text-[10px] font-semibold leading-none">{firstLetter}</span>
  }

  if (isColorDrivenMaterialType(tipo)) {
    return <Circle className="h-3 w-3" aria-hidden />
  }

  return <Box className="h-3 w-3" aria-hidden />
}

export function MaterialAvatar({
  imageUrl,
  color,
  tipo,
  nome,
  className,
}: MaterialAvatarProps) {
  const safeImageUrl = getSafeImageUrl(imageUrl)
  const canShowColor = isColorDrivenMaterialType(tipo) && isValidHexColor(color)

  if (safeImageUrl) {
    return (
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 overflow-hidden rounded-md border border-border bg-muted',
          className
        )}
      >
        <img
          src={safeImageUrl}
          alt={nome ? `Imagem de ${nome}` : 'Imagem do material'}
          className="h-full w-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      </span>
    )
  }

  if (canShowColor) {
    return (
      <span
        className={cn('h-5 w-5 shrink-0 rounded-full border border-gray-300 shadow-sm', className)}
        style={{ backgroundColor: color?.trim() }}
        title={color?.trim()}
        aria-label={nome ? `Cor de ${nome}` : 'Cor do material'}
      />
    )
  }

  return (
    <span
      className={cn(
        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-muted text-muted-foreground shadow-sm',
        className
      )}
      aria-label={nome ? `Tipo de ${nome}` : 'Tipo do material'}
      title={tipo || 'Material'}
    >
      <FallbackIcon tipo={tipo} nome={nome} />
    </span>
  )
}
