import { cache } from 'react'
import { headers } from 'next/headers'
import { withTenantContext } from '@/lib/supabase/tenant'

export type GuestSessionContext = {
  propertyId: string
  sessionId: string
  authLevel: number
  guestFirstName: string | null
  propertyName: string
  logoUrl: string | null
}

export const getGuestSessionContext = cache(async (): Promise<GuestSessionContext | null> => {
  const requestHeaders = await headers()

  let client
  try {
    client = await withTenantContext(requestHeaders)
  } catch {
    return null
  }

  const sessionId = requestHeaders.get('x-session-id')
  const propertyId = requestHeaders.get('x-property-id')
  if (!sessionId || !propertyId) return null

  const { data: session } = await client
    .from('sessions')
    .select('id, property_id, auth_level, reservation_id')
    .eq('id', sessionId)
    .single()

  if (!session || session.auth_level < 1) return null

  const { data: property } = await client
    .from('properties')
    .select('name, logo_url')
    .eq('id', session.property_id)
    .single()

  if (!property) return null

  let guestFirstName: string | null = null
  if (session.reservation_id) {
    const { data: reservation } = await client
      .from('reservations')
      .select('guest_first_name')
      .eq('id', session.reservation_id)
      .single()
    guestFirstName = reservation?.guest_first_name ?? null
  }

  return {
    propertyId: session.property_id,
    sessionId: session.id,
    authLevel: session.auth_level,
    guestFirstName,
    propertyName: property.name,
    logoUrl: property.logo_url,
  }
})
