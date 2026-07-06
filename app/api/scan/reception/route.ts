import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { findAndConsumeToken, createReceptionSession } from '@/lib/scan/reception'
import { checkScanRateLimit } from '@/lib/rate-limit/scan'
import { resolveIpInfo } from '@/lib/geo/ip-info'
import { trackAndDetectAnomaly } from '@/lib/anomaly/detect'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { Database } from '@/lib/supabase/database.types'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  const rateLimit = await checkScanRateLimit(ip)
  if (!rateLimit.allowed) {
    return new NextResponse(null, {
      status: 429,
      headers: {
        'Retry-After': String(rateLimit.retryAfter),
        'X-RateLimit-Remaining': '0',
      },
    })
  }

  const initToken = request.nextUrl.searchParams.get('init_token')
  if (!initToken) {
    return NextResponse.redirect(new URL('/error?type=token_not_found', request.url))
  }

  const tokenResult = await findAndConsumeToken(initToken)
  if (!tokenResult.ok) {
    return NextResponse.redirect(new URL(`/error?type=${tokenResult.error}`, request.url))
  }

  const qr = tokenResult.qr

  // Supabase SSR client writes auth cookies to the redirect response.
  // The response variable is captured by the setAll closure so cookies land on the
  // outgoing redirect rather than being orphaned in next/headers.
  const response = NextResponse.redirect(new URL('/', request.url))

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
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
    error: signInError,
  } = await supabase.auth.signInAnonymously()

  if (signInError || !user) {
    return NextResponse.redirect(new URL('/error?type=auth_failed', request.url))
  }

  // Sessions row must exist before refreshSession() so the Custom Access Token Hook
  // can inject the correct claims on the very first refresh.
  const session = await createReceptionSession({
    propertyId: qr.property_id,
    authUserId: user.id,
  })

  const { error: refreshError } = await supabase.auth.refreshSession()
  if (refreshError) {
    return NextResponse.redirect(new URL('/error?type=auth_failed', request.url))
  }

  response.cookies.set('__Host-session', session.id, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
  })

  try {
    const ipInfo = await resolveIpInfo(ip)
    if (ipInfo.asn !== null) {
      await createServiceRoleClient()
        .from('sessions')
        .update({ last_asn: ipInfo.asn })
        .eq('id', session.id)
    }
    await trackAndDetectAnomaly({
      sessionId: session.id,
      propertyId: qr.property_id,
      asn: ipInfo.asn,
      country: ipInfo.country,
    })
  } catch {
    // non-fatal: anomaly detection errors do not affect the scan result
  }

  // TODO(S5.1): posthog.capture('guest_qr_scanned', { qr_type: 'reception', property_id: qr.property_id })

  return response
}
