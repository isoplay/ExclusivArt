import { redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

function normalizeDisplayName(value: unknown) {
  if (typeof value !== 'string') return null

  const name = value.trim().replace(/\s+/g, ' ')
  return name.length > 0 ? name : null
}

function titleCaseName(value: string) {
  return value
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

export async function createAuthenticatedClient() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/login')
  }

  return supabase
}

export async function getAuthenticatedUser() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/login')
  }

  return user
}

export function getUserDisplayName(user: User | null | undefined) {
  const metadata = user?.user_metadata ?? {}
  const metadataName =
    normalizeDisplayName(metadata.nome) ||
    normalizeDisplayName(metadata.name) ||
    normalizeDisplayName(metadata.full_name) ||
    normalizeDisplayName(metadata.display_name)

  if (metadataName) {
    return metadataName
  }

  const emailName = normalizeDisplayName(user?.email?.split('@')[0]?.replace(/[._-]+/g, ' '))
  if (emailName) {
    return titleCaseName(emailName)
  }

  return 'Exclusiv Art'
}
