import { cache } from 'react'
import { headers } from 'next/headers'
import { withTenantContext } from '@/lib/supabase/tenant'

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

export const getGuestSessionContext = cache(async (): Promise<GuestSessionContext | null> => {
  const requestHeaders = await headers()

  let client
  try {
    client = await withTenantContext(requestHeaders)
  } catch {
    return null
  }

  // proxy.ts already looked up this session row (revoked/expired check) and forwards the
  // columns we need as headers — avoids a second `sessions` round-trip for the same row.
  const sessionId = requestHeaders.get('x-session-id')
  const propertyId = requestHeaders.get('x-property-id')
  const authLevelHeader = requestHeaders.get('x-session-auth-level')
  const reservationId = requestHeaders.get('x-session-reservation-id')
  const roomId = requestHeaders.get('x-session-room-id')
  if (!sessionId || !propertyId || !authLevelHeader) return null

  const authLevel = Number(authLevelHeader)
  if (authLevel < 1) return null

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
