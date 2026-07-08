'use server'

import { revalidatePath } from 'next/cache'
import { createServerClient } from '@/lib/supabase/server'
import { getHotelUser } from '@/lib/panel/auth'
import { canPerform } from '@/lib/panel/rbac'
import { captureEvent } from '@/lib/analytics/capture'

export async function saveHotelProfile(formData: FormData): Promise<{ error?: string }> {
  const hotelUser = await getHotelUser()
  if (!hotelUser || !canPerform(hotelUser.role, 'hotel_profile', 'write')) {
    return { error: 'forbidden' }
  }

  const name = String(formData.get('name') ?? '').trim()
  const address = String(formData.get('address') ?? '').trim()
  const phoneReception = String(formData.get('phone_reception') ?? '').trim()
  const timezone = String(formData.get('timezone') ?? '').trim()
  const checkInTime = String(formData.get('check_in_time') ?? '').trim()
  const checkOutTime = String(formData.get('check_out_time') ?? '').trim()
  const logoUrl = String(formData.get('logo_url') ?? '').trim()

  if (!name) {
    return { error: 'nameRequired' }
  }

  if (logoUrl) {
    try {
      new URL(logoUrl)
    } catch {
      return { error: 'invalidUrl' }
    }
  }

  const supabase = await createServerClient()
  const { error } = await supabase
    .from('properties')
    .update({
      name,
      address: address || null,
      phone_reception: phoneReception || null,
      timezone: timezone || undefined,
      check_in_time: checkInTime || null,
      check_out_time: checkOutTime || null,
      logo_url: logoUrl || null,
      setup_completed: true,
    })
    .eq('id', hotelUser.propertyId)

  if (error) {
    throw new Error(error.message)
  }

  void captureEvent(
    { name: 'hotel_settings_updated', properties: { area: 'profile' } },
    { distinctId: hotelUser.id, propertyId: hotelUser.propertyId }
  )

  revalidatePath('/onboarding')
  revalidatePath('/dashboard')

  return {}
}
