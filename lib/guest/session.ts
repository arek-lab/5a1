import { cache } from 'react'
import { cookies, headers } from 'next/headers'
import * as Sentry from '@sentry/nextjs'
import { withTenantContext } from '@/lib/supabase/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export type GuestSessionContext = {
  propertyId: string
  sessionId: string
  authLevel: number
  guestFirstName: string | null
  checkIn: string | null
  checkOut: string | null
  roomNumber: string | null
  roomId: string | null
  reservationId: string | null
  propertyName: string
  logoUrl: string | null
  aiBotName: string | null
  phoneReception: string | null
}

type SessionCore = {
  sessionId: string
  propertyId: string
  authLevel: number
  reservationId: string | null
  roomId: string | null
}

// proxy.ts sets these on the same request right after its own `sessions` lookup, so this is
// normally free — but if that row lookup raced a just-committed write (e.g. the guest landing
// here a moment after a QR scan upgraded auth_level), the headers can be momentarily absent.
// Falls back to a direct read in that case rather than stranding the guest on an error page.
async function resolveSessionCore(requestHeaders: Headers): Promise<SessionCore | null> {
  const sessionId = requestHeaders.get('x-session-id')
  const propertyId = requestHeaders.get('x-property-id')
  const authLevelHeader = requestHeaders.get('x-session-auth-level')

  if (sessionId && propertyId && authLevelHeader) {
    return {
      sessionId,
      propertyId,
      authLevel: Number(authLevelHeader),
      reservationId: requestHeaders.get('x-session-reservation-id'),
      roomId: requestHeaders.get('x-session-room-id'),
    }
  }

  const cookieStore = await cookies()
  const cookieSessionId = cookieStore.get('__Host-session')?.value
  if (!cookieSessionId) {
    Sentry.captureMessage('guest_session_null: no session headers and no session cookie', {
      level: 'warning',
      extra: {
        hasPropertyIdHeader: Boolean(propertyId),
        hasSessionIdHeader: Boolean(sessionId),
        hasAuthLevelHeader: Boolean(authLevelHeader),
      },
    })
    await Sentry.flush(2000)
    return null
  }

  const { data: session, error } = await createServiceRoleClient()
    .from('sessions')
    .select('id, property_id, auth_level, reservation_id, room_id')
    .eq('id', cookieSessionId)
    .single()
  if (!session) {
    Sentry.captureMessage('guest_session_null: cookie fallback session lookup found no row', {
      level: 'warning',
      extra: { cookieSessionId, error },
    })
    // Fire-and-forget capture calls can get dropped if the redirect() that follows ends the
    // request before the SDK's queued network send goes out — flush explicitly so these
    // diagnostic events are actually delivered instead of silently vanishing.
    await Sentry.flush(2000)
    return null
  }

  return {
    sessionId: session.id,
    propertyId: session.property_id,
    authLevel: session.auth_level,
    reservationId: session.reservation_id,
    roomId: session.room_id,
  }
}

export const getGuestSessionContext = cache(async (): Promise<GuestSessionContext | null> => {
  const requestHeaders = await headers()

  const core = await resolveSessionCore(requestHeaders)
  if (!core) return null
  if (core.authLevel < 1) {
    Sentry.captureMessage('guest_session_null: authLevel < 1', {
      level: 'warning',
      extra: { sessionId: core.sessionId, propertyId: core.propertyId, authLevel: core.authLevel },
    })
    await Sentry.flush(2000)
    return null
  }

  const { sessionId, propertyId, authLevel, reservationId, roomId } = core

  let client
  try {
    client = await withTenantContext(
      new Headers({ 'x-property-id': propertyId, 'x-session-id': sessionId })
    )
  } catch (err) {
    Sentry.captureException(err, { extra: { sessionId, propertyId } })
    await Sentry.flush(2000)
    return null
  }

  const fetchProperty = () =>
    client
      .from('properties')
      .select('name, logo_url, ai_bot_name, phone_reception')
      .eq('id', propertyId)
      .single()

  const [propertyResult, reservationResult, roomResult] = await Promise.all([
    fetchProperty(),
    reservationId
      ? client
          .from('reservations')
          .select('guest_first_name, check_in, check_out')
          .eq('id', reservationId)
          .single()
      : Promise.resolve({ data: null }),
    roomId
      ? client.from('rooms').select('room_number').eq('id', roomId).single()
      : Promise.resolve({ data: null }),
  ])

  let property = propertyResult.data
  // A transient PgBouncer/network blip right after the scan route's own writes is more
  // plausible here than a genuinely missing property row, so one short retry before giving up.
  if (!property) {
    await sleep(150)
    const retryResult = await fetchProperty()
    property = retryResult.data
    if (!property) {
      Sentry.captureMessage('guest_session_null: properties fetch returned no row after retry', {
        level: 'warning',
        extra: {
          sessionId,
          propertyId,
          firstError: propertyResult.error,
          retryError: retryResult.error,
        },
      })
      await Sentry.flush(2000)
      return null
    }
  }

  return {
    propertyId,
    sessionId,
    authLevel,
    guestFirstName: reservationResult.data?.guest_first_name ?? null,
    checkIn: reservationResult.data?.check_in ?? null,
    checkOut: reservationResult.data?.check_out ?? null,
    roomNumber: roomResult.data?.room_number ?? null,
    roomId,
    reservationId,
    propertyName: property.name,
    logoUrl: property.logo_url,
    aiBotName: property.ai_bot_name,
    phoneReception: property.phone_reception,
  }
})
