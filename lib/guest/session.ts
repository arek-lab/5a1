import { cache } from 'react'
import { unstable_cache } from 'next/cache'
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

// Descriptive data only (property profile, reservation, room) may live in this cross-request
// cache — session-security fields (revoked/expires_at/auth_level) are hard-HITL "no cache"
// and always flow fresh from the middleware's per-request `sessions` lookup.
const DESCRIPTIVE_CACHE_TTL_S = 300

class GuestPropertyFetchError extends Error {
  constructor(
    readonly firstError: unknown,
    readonly retryError: unknown
  ) {
    super('guest property fetch returned no row after retry')
  }
}

// The cached functions below take ids as explicit arguments (arguments are part of the
// unstable_cache key) and create their own stateless client inside — unstable_cache must not
// close over headers()/cookies(), and the return value must be plain JSON, not a supabase-js
// response object.
async function fetchGuestProperty(propertyId: string) {
  const client = createServiceRoleClient()
  const fetchProperty = () =>
    client
      .from('properties')
      .select('name, logo_url, ai_bot_name, phone_reception')
      .eq('id', propertyId)
      .single()

  let result = await fetchProperty()
  // A transient PgBouncer/network blip right after the scan route's own writes is more
  // plausible here than a genuinely missing property row, so one short retry before giving up.
  if (!result.data) {
    await sleep(150)
    const retry = await fetchProperty()
    if (!retry.data) {
      // Thrown instead of returning null so unstable_cache doesn't memoize the failure
      // for the whole TTL — the caller maps it to the usual Sentry-reported null.
      throw new GuestPropertyFetchError(result.error, retry.error)
    }
    result = retry
  }
  const { name, logo_url, ai_bot_name, phone_reception } = result.data
  return { name, logo_url, ai_bot_name, phone_reception }
}

// Per-call unstable_cache construction (instead of one module-level wrap) because the
// invalidation tag is per property — the hotel panel calls revalidateTag on profile writes.
function getCachedGuestProperty(propertyId: string) {
  return unstable_cache(fetchGuestProperty, ['guest-property'], {
    revalidate: DESCRIPTIVE_CACHE_TTL_S,
    tags: [`guest-property-${propertyId}`],
  })(propertyId)
}

async function fetchGuestReservation(reservationId: string) {
  const { data } = await createServiceRoleClient()
    .from('reservations')
    .select('guest_first_name, check_in, check_out')
    .eq('id', reservationId)
    .single()
  if (!data) return null
  const { guest_first_name, check_in, check_out } = data
  return { guest_first_name, check_in, check_out }
}

const getCachedGuestReservation = unstable_cache(fetchGuestReservation, ['guest-reservation'], {
  revalidate: DESCRIPTIVE_CACHE_TTL_S,
})

async function fetchGuestRoom(roomId: string) {
  const { data } = await createServiceRoleClient()
    .from('rooms')
    .select('room_number')
    .eq('id', roomId)
    .single()
  return data ? { room_number: data.room_number } : null
}

const getCachedGuestRoom = unstable_cache(fetchGuestRoom, ['guest-room'], {
  revalidate: DESCRIPTIVE_CACHE_TTL_S,
})

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

  // The cached fetches below use their own service-role client, but this still runs for its
  // header validation (UUID format of x-property-id / x-session-id) before any query is keyed
  // off those values.
  try {
    await withTenantContext(
      new Headers({ 'x-property-id': propertyId, 'x-session-id': sessionId })
    )
  } catch (err) {
    Sentry.captureException(err, { extra: { sessionId, propertyId } })
    await Sentry.flush(2000)
    return null
  }

  let property
  let reservation
  let room
  try {
    ;[property, reservation, room] = await Promise.all([
      getCachedGuestProperty(propertyId),
      reservationId ? getCachedGuestReservation(reservationId) : Promise.resolve(null),
      roomId ? getCachedGuestRoom(roomId) : Promise.resolve(null),
    ])
  } catch (err) {
    const fetchError = err instanceof GuestPropertyFetchError ? err : null
    Sentry.captureMessage('guest_session_null: properties fetch returned no row after retry', {
      level: 'warning',
      extra: {
        sessionId,
        propertyId,
        firstError: fetchError?.firstError,
        retryError: fetchError?.retryError ?? err,
      },
    })
    await Sentry.flush(2000)
    return null
  }

  return {
    propertyId,
    sessionId,
    authLevel,
    guestFirstName: reservation?.guest_first_name ?? null,
    checkIn: reservation?.check_in ?? null,
    checkOut: reservation?.check_out ?? null,
    roomNumber: room?.room_number ?? null,
    roomId,
    reservationId,
    propertyName: property.name,
    logoUrl: property.logo_url,
    aiBotName: property.ai_bot_name,
    phoneReception: property.phone_reception,
  }
})
