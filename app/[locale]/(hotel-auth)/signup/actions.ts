'use server'

import { headers } from 'next/headers'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { checkSignupRateLimit } from '@/lib/rate-limit/signup'
import { validateHotelName } from '@/lib/panel/signup-validation'

type ActionResult = { ok: true } | { ok: false; error: string }

export async function createHotelAndOwner(formData: FormData): Promise<ActionResult> {
  const authUserId = String(formData.get('authUserId') ?? '')
  const email = String(formData.get('email') ?? '').trim()
  const hotelName = String(formData.get('hotelName') ?? '')

  if (!authUserId || !email) {
    return { ok: false, error: 'invalid_request' }
  }

  const nameValidation = validateHotelName(hotelName)
  if (!nameValidation.ok) {
    return { ok: false, error: nameValidation.error }
  }

  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  const rateLimit = await checkSignupRateLimit(ip)
  if (!rateLimit.allowed) {
    return { ok: false, error: 'rate_limited' }
  }

  const serviceRole = createServiceRoleClient()
  const { error } = await serviceRole.rpc('create_hotel_and_owner', {
    p_auth_user_id: authUserId,
    p_email: email,
    p_hotel_name: nameValidation.value,
  })
  if (error) {
    if (error.message.includes('email_taken')) return { ok: false, error: 'email_taken' }
    if (error.message.includes('invalid_hotel_name')) return { ok: false, error: 'invalid_hotel_name' }
    throw new Error(error.message)
  }

  return { ok: true }
}
