'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

function loginError(message: string) {
  redirect(`/login?error=${encodeURIComponent(message)}`)
}

export async function login(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')

  if (!email || !password) {
    loginError('Informe email e senha')
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    loginError('Credenciais invalidas')
  }

  redirect('/dashboard?welcome=1')
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
