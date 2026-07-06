import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { validateRoomScan, upgradeSession } from '@/lib/scan/room'
import { checkScanRateLimit } from '@/lib/rate-limit/scan'
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

  const sessionId = request.cookies.get('__Host-session')?.value
  if (!sessionId) {
    return NextResponse.redirect(new URL('/error?type=missing_session_cookie', request.url))
  }

  const roomId = request.nextUrl.searchParams.get('room_id')
  if (!roomId) {
    return NextResponse.redirect(new URL('/error?type=room_qr_not_found', request.url))
  }

  const validation = await validateRoomScan({ sessionId, roomId })
  if (!validation.ok) {
    return NextResponse.redirect(new URL(`/error?type=${validation.error}`, request.url))
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

  // Supabase SSR client reads existing anonymous session from request cookies and
  // writes refreshed tokens to the redirect response.
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

  const { error: refreshError } = await supabase.auth.refreshSession()
  if (refreshError) {
    return NextResponse.redirect(new URL('/error?type=auth_failed', request.url))
  }

  // TODO(S5.1): posthog.capture('guest_qr_scanned', { qr_type: 'room' })

  return response
}
