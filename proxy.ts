import { createServerClient } from '@supabase/ssr'
import createIntlMiddleware from 'next-intl/middleware'
import { NextRequest, NextResponse } from 'next/server'
import { routing } from './i18n/routing'
import type { Database } from './lib/supabase/database.types'

const handleI18nRouting = createIntlMiddleware(routing)

export default async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getUser() refreshes the JWT and may invoke setAll to write updated cookies.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Inject tenant claims from JWT app_metadata into request headers so that
  // route handlers can call withTenantContext(headers) without re-decoding the JWT.
  const requestHeaders = new Headers(request.headers)
  const meta = user?.app_metadata as { property_id?: string; session_id?: string } | undefined
  if (typeof meta?.property_id === 'string') {
    requestHeaders.set('x-property-id', meta.property_id)
  }
  if (typeof meta?.session_id === 'string') {
    requestHeaders.set('x-session-id', meta.session_id)
  }

  // API routes: auth refresh + header injection only; skip locale routing to avoid
  // next-intl rewriting /api/* to /[locale]/api/* (which doesn't exist).
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const apiResponse = NextResponse.next({ request: { headers: requestHeaders } })
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      apiResponse.cookies.set(cookie)
    })
    return apiResponse
  }

  // Page routes: run next-intl locale routing on a request that already carries
  // the tenant headers, so any internal rewrite also forwards them to the route handler.
  const intlResponse = handleI18nRouting(
    new NextRequest(request.url, {
      headers: requestHeaders,
      method: request.method,
    })
  )

  // Transfer Supabase auth cookies (session refresh) onto the intl response.
  supabaseResponse.cookies.getAll().forEach((cookie) => {
    intlResponse.cookies.set(cookie)
  })

  return intlResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
