import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { findAndConsumeToken, createReceptionSession } from '@/lib/scan/reception'
import { setSessionCookie } from '@/lib/guest/session-cookie'
import { checkScanRateLimit } from '@/lib/rate-limit/scan'
import { resolveIpInfo } from '@/lib/geo/ip-info'
import { trackAndDetectAnomaly } from '@/lib/anomaly/detect'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { captureEvent } from '@/lib/analytics/capture'
import { absoluteUrl } from '@/lib/http/app-url'
import type { Database } from '@/lib/supabase/database.types'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  const rateLimit = await checkScanRateLimit(ip)
  if (!rateLimit.allowed) {
    const response = NextResponse.redirect(absoluteUrl('/error?type=rate_limited'))
    response.headers.set('Retry-After', String(rateLimit.retryAfter))
    return response
  }

  const initToken = request.nextUrl.searchParams.get('init_token')
  if (!initToken) {
    return NextResponse.redirect(absoluteUrl('/error?type=token_not_found'))
  }

  const tokenResult = await findAndConsumeToken(initToken)
  if (!tokenResult.ok) {
    const redirectUrl = absoluteUrl(`/error?type=${tokenResult.error}`)
    if (tokenResult.qr) redirectUrl.searchParams.set('property_id', tokenResult.qr.property_id)
    return NextResponse.redirect(redirectUrl)
  }

  const qr = tokenResult.qr

  // Supabase SSR client writes auth cookies to the redirect response.
  // The response variable is captured by the setAll closure so cookies land on the
  // outgoing redirect rather than being orphaned in next/headers.
  const response = NextResponse.redirect(absoluteUrl('/'))

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
    const redirectUrl = absoluteUrl('/error?type=auth_failed')
    redirectUrl.searchParams.set('property_id', qr.property_id)
    return NextResponse.redirect(redirectUrl)
  }

  // Sessions row must exist before refreshSession() so the Custom Access Token Hook
  // can inject the correct claims on the very first refresh.
  const session = await createReceptionSession({
    propertyId: qr.property_id,
    authUserId: user.id,
  })

  const { error: refreshError } = await supabase.auth.refreshSession()
  if (refreshError) {
    const redirectUrl = absoluteUrl('/error?type=auth_failed')
    redirectUrl.searchParams.set('property_id', qr.property_id)
    return NextResponse.redirect(redirectUrl)
  }

  setSessionCookie(response, session.id, session.expires_at)

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

  void captureEvent(
    { name: 'guest_qr_scanned', properties: { qr_type: 'reception' } },
    { distinctId: session.id, propertyId: qr.property_id }
  )

  return response
}
