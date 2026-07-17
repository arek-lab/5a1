import { cache } from 'react'
import { cookies, headers } from 'next/headers'
import { withTenantContext } from '@/lib/supabase/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

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
  if (!cookieSessionId) return null

  const { data: session } = await createServiceRoleClient()
    .from('sessions')
    .select('id, property_id, auth_level, reservation_id, room_id')
    .eq('id', cookieSessionId)
    .single()
  if (!session) return null

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
  if (core.authLevel < 1) return null

  const { sessionId, propertyId, authLevel, reservationId, roomId } = core

  let client
  try {
    client = await withTenantContext(
      new Headers({ 'x-property-id': propertyId, 'x-session-id': sessionId })
    )
  } catch {
    return null
  }

  const [{ data: property }, reservationResult, roomResult] = await Promise.all([
    client
      .from('properties')
      .select('name, logo_url, ai_bot_name, phone_reception')
      .eq('id', propertyId)
      .single(),
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

  if (!property) return null

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
