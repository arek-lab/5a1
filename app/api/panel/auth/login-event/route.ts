import { NextResponse } from 'next/server'
import { getHotelUser } from '@/lib/panel/auth'
import { captureEvent } from '@/lib/analytics/capture'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export async function POST(): Promise<NextResponse> {
  const hotelUser = await getHotelUser()
  if (!hotelUser) {
    return new NextResponse(null, { status: 401 })
  }

  await captureEvent(
    { name: 'hotel_login', properties: {} },
    { distinctId: hotelUser.id, propertyId: hotelUser.propertyId }
  )

  await createServiceRoleClient()
    .from('hotel_users')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', hotelUser.id)

  return new NextResponse(null, { status: 204 })
}
