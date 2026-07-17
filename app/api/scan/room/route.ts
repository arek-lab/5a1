import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { validateRoomScan, upgradeSession } from '@/lib/scan/room'
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

  const sessionId = request.cookies.get('__Host-session')?.value
  if (!sessionId) {
    return NextResponse.redirect(absoluteUrl('/error?type=missing_session_cookie'))
  }

  const roomId = request.nextUrl.searchParams.get('room_id')
  if (!roomId) {
    return NextResponse.redirect(absoluteUrl('/error?type=room_qr_not_found'))
  }

  const validation = await validateRoomScan({ sessionId, roomId })
  if (!validation.ok) {
    const redirectUrl = absoluteUrl(`/error?type=${validation.error}`)
    if (validation.session) redirectUrl.searchParams.set('property_id', validation.session.property_id)
    return NextResponse.redirect(redirectUrl)
  }

  if (validation.status === 'already_active') {
    return NextResponse.redirect(absoluteUrl('/'))
  }

  const { reservation } = validation

  // Sessions row upgrade must precede refreshSession() so the hook sees auth_level=2
  // when it queries sessions on the next token refresh.
  await upgradeSession({
    sessionId,
    roomId,
    reservationId: reservation.id,
    checkOut: reservation.check_out,
  })

  try {
    const ipInfo = await resolveIpInfo(ip)
    if (ipInfo.asn !== null) {
      await createServiceRoleClient()
        .from('sessions')
        .update({ last_asn: ipInfo.asn })
        .eq('id', sessionId)
    }
    await trackAndDetectAnomaly({
      sessionId,
      propertyId: validation.session.property_id,
      asn: ipInfo.asn,
      country: ipInfo.country,
    })
  } catch {
    // non-fatal: anomaly detection errors do not affect the scan result
  }

  // Supabase SSR client reads existing anonymous session from request cookies and
  // writes refreshed tokens to the redirect response.
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

  const { error: refreshError } = await supabase.auth.refreshSession()
  if (refreshError) {
    const redirectUrl = absoluteUrl('/error?type=auth_failed')
    redirectUrl.searchParams.set('property_id', validation.session.property_id)
    return NextResponse.redirect(redirectUrl)
  }

  void captureEvent(
    { name: 'guest_qr_scanned', properties: { qr_type: 'room' } },
    { distinctId: sessionId, propertyId: validation.session.property_id }
  )

  return response
}
