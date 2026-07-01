import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { cache } from 'react'
import type { User } from '@supabase/supabase-js'
import { BRAND_NAME } from '@/lib/brand'
import { isInvalidRefreshTokenError, isSupabaseAuthCookie } from '@/lib/supabase/auth-errors'
import { createClient } from '@/lib/supabase/server'
import { logServerError, logServerInfo } from '@/lib/server-log'

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

async function clearSupabaseServerCookies() {
  const cookieStore = await cookies()
  const authCookies = cookieStore.getAll().filter((cookie) => isSupabaseAuthCookie(cookie.name))

  for (const cookie of authCookies) {
    try {
      cookieStore.delete(cookie.name)
    } catch {
      return
    }
  }
}

async function redirectToLoginAfterAuthError(error?: unknown) {
  if (isInvalidRefreshTokenError(error)) {
    logServerInfo('auth_invalid_refresh_cleared', {})
    await clearSupabaseServerCookies()
    redirect('/login?error=Sessao%20expirada.%20Entre%20novamente')
  }

  if (error) {
    logServerError('auth_get_user_failed', error)
  }

  redirect('/login')
}

const getAuthenticatedSession = cache(async () => {
  const supabase = await createClient()
  let user: User | null = null
  let authError: unknown = null

  try {
    const result = await supabase.auth.getUser()
    user = result.data.user
    authError = result.error
  } catch (error) {
    authError = error
    logServerError('auth_get_user_exception', error)
  }

  if (authError || !user) {
    await redirectToLoginAfterAuthError(authError)
  }

  return { supabase, user }
})

export async function createAuthenticatedClient() {
  const { supabase } = await getAuthenticatedSession()
  return supabase
}

export async function getAuthenticatedUser() {
  const { user } = await getAuthenticatedSession()
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

  return BRAND_NAME
}
