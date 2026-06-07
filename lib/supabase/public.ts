import 'server-only'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { logServerError } from '@/lib/server-log'

export function createPublicClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    logServerError('supabase_public_env_missing', new Error('Supabase public env missing'), {
      missingUrl: !supabaseUrl,
      missingAnonKey: !supabaseAnonKey,
    })
    throw new Error('Supabase public URL and anon key must be configured')
  }

  return createSupabaseClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  })
}
