import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isInvalidRefreshTokenError, isSupabaseAuthCookie } from '@/lib/supabase/auth-errors'
import { logServerError, logServerInfo } from '@/lib/server-log'

function clearSupabaseCookies(request: NextRequest, response: NextResponse) {
  request.cookies
    .getAll()
    .filter((cookie) => isSupabaseAuthCookie(cookie.name))
    .forEach((cookie) => {
      request.cookies.delete(cookie.name)
      response.cookies.delete(cookie.name)
    })
}

function redirectToLogin(request: NextRequest, response: NextResponse) {
  const url = request.nextUrl.clone()
  url.pathname = '/login'
  url.searchParams.set('next', request.nextUrl.pathname)

  const redirectResponse = NextResponse.redirect(url)
  response.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie)
  })

  clearSupabaseCookies(request, redirectResponse)
  return redirectResponse
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })
  const isDashboard = request.nextUrl.pathname.startsWith('/dashboard')
  const isLogin = request.nextUrl.pathname === '/login'

  // Check if Supabase environment variables are available
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    logServerError('middleware_supabase_env_missing', new Error('Supabase env missing'), {
      route: request.nextUrl.pathname,
      missingUrl: !supabaseUrl,
      missingAnonKey: !supabaseAnonKey,
    })
    if (isDashboard) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('error', 'Configuracao do Supabase ausente')
      return NextResponse.redirect(url)
    }
    return supabaseResponse
  }

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>) {
          cookiesToSet.forEach(({ name, value }: { name: string; value: string }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }: { name: string; value: string; options?: CookieOptions }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: If you remove getUser() and you use server-side rendering
  // with the Supabase client, your users may be randomly logged out.
  let user = null
  let authError: unknown = null

  try {
    const result = await supabase.auth.getUser()
    user = result.data.user
    authError = result.error
  } catch (error) {
    authError = error
    logServerError('middleware_get_user_exception', error, {
      route: request.nextUrl.pathname,
    })
  }

  if (isInvalidRefreshTokenError(authError)) {
    logServerInfo('middleware_invalid_refresh_cleared', {
      route: request.nextUrl.pathname,
      dashboard: isDashboard,
    })
    clearSupabaseCookies(request, supabaseResponse)

    if (isDashboard) {
      return redirectToLogin(request, supabaseResponse)
    }

    return supabaseResponse
  }

  if (isDashboard && !user) {
    logServerInfo('middleware_dashboard_without_session', {
      route: request.nextUrl.pathname,
    })
    return redirectToLogin(request, supabaseResponse)
  }

  if (isLogin && user) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    url.search = ''
    return NextResponse.redirect(url)
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse
}
