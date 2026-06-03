export function isInvalidRefreshTokenError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false
  }

  const authError = error as { code?: string; message?: string }
  const code = authError.code?.toLowerCase() ?? ''
  const message = authError.message?.toLowerCase() ?? ''

  return (
    code === 'refresh_token_not_found' ||
    code === 'invalid_grant' ||
    message.includes('invalid refresh token') ||
    message.includes('refresh token not found')
  )
}

export function isSupabaseAuthCookie(name: string) {
  return (
    name.startsWith('sb-') ||
    name === 'supabase-auth-token' ||
    name === 'supabase.auth.token'
  )
}
