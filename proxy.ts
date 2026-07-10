import { createServerClient } from '@supabase/ssr'
import createIntlMiddleware from 'next-intl/middleware'
import { NextRequest, NextResponse } from 'next/server'
import { routing } from './i18n/routing'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { captureEvent } from '@/lib/analytics/capture'
import type { Database } from './lib/supabase/database.types'

const handleI18nRouting = createIntlMiddleware(routing)

const GUEST_RETURN_GAP_MS = 30 * 60 * 1000

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Admin area lives outside [locale] entirely — single shared-token gate, no
  // guest-session or intl routing logic applies here.
  if (pathname.startsWith('/admin')) {
    if (pathname !== '/admin/login') {
      const adminToken = request.cookies.get('admin_token')?.value
      if (!adminToken || adminToken !== process.env.ADMIN_ACCESS_TOKEN) {
        return NextResponse.redirect(new URL('/admin/login', request.url))
      }
    }
    return NextResponse.next()
  }

  // File-convention metadata routes (manifest.ts -> /manifest.webmanifest) live outside
  // [locale] entirely. Left to the intl middleware below, they get rewritten to a
  // locale-prefixed path (e.g. /pl/manifest.webmanifest) that doesn't exist, 404ing
  // the manifest and breaking PWA installability.
  if (pathname === '/manifest.webmanifest') {
    return NextResponse.next()
  }

  const sessionId = request.cookies.get('__Host-session')?.value
  if (sessionId) {
    const admin = createServiceRoleClient()
    const { data: session } = await admin
      .from('sessions')
      .select('id, revoked, expires_at, property_id, last_seen_at')
      .eq('id', sessionId)
      .single()

    const invalid = !session || session.revoked || new Date(session.expires_at) <= new Date()
    if (invalid) {
      if (request.nextUrl.pathname.startsWith('/api/')) {
        return new NextResponse(null, { status: 401 })
      }
      const response = NextResponse.redirect(new URL('/error?type=session_revoked', request.url))
      // __Host- prefixed cookies require Secure (and Path=/) on every Set-Cookie, including
      // clearing ones — omitting it makes the browser silently reject the header entirely,
      // leaving the stale invalid cookie in place and causing a redirect loop back to this branch.
      response.cookies.delete({ name: '__Host-session', path: '/', secure: true })
      return response
    }

    // Guest page routes only: API calls under /api/ don't represent a "visit" for
    // return-detection purposes, and the last_seen_at read must happen before the
    // write below so a burst of concurrent requests can't erase the gap it measures.
    if (!request.nextUrl.pathname.startsWith('/api/')) {
      const gapMs = Date.now() - new Date(session.last_seen_at).getTime()
      if (gapMs > GUEST_RETURN_GAP_MS) {
        void captureEvent(
          { name: 'guest_session_returned', properties: {} },
          { distinctId: session.id, propertyId: session.property_id }
        )
      }
      void admin
        .from('sessions')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', session.id)
    }
  }

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

  // getClaims() refreshes the JWT (like getUser()) and decodes the token itself,
  // so it reflects claims injected by the Custom Access Token Hook. getUser() must
  // NOT be used here: it returns auth.users.raw_app_meta_data from the Auth server,
  // which the hook never modifies — only the issued JWT's claims are hook-derived.
  const { data: claimsData } = await supabase.auth.getClaims()

  // Inject tenant claims from JWT app_metadata into request headers so that
  // route handlers can call withTenantContext(headers) without re-decoding the JWT.
  const requestHeaders = new Headers(request.headers)
  const meta = claimsData?.claims.app_metadata as
    | { property_id?: string; session_id?: string }
    | undefined
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
