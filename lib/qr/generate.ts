import type { Tables } from '@/lib/supabase/database.types'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export class DpaNotSignedError extends Error {
  constructor(propertyId: string) {
    super(`DPA not signed for property ${propertyId}`)
    this.name = 'DpaNotSignedError'
  }
}

export async function checkDpa(propertyId: string): Promise<void> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('properties')
    .select('dpa_signed_at')
    .eq('id', propertyId)
    .single()

  if (error) throw error
  if (data.dpa_signed_at === null) throw new DpaNotSignedError(propertyId)
}

export async function generateReceptionQR(
  propertyId: string
): Promise<Tables<'qr_codes'>> {
  await checkDpa(propertyId)

  const supabase = createServiceRoleClient()

  const { error: updateError } = await supabase
    .from('qr_codes')
    .update({ is_active: false })
    .eq('property_id', propertyId)
    .eq('type', 'reception')
    .eq('is_active', true)

  if (updateError) throw updateError

  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()

  const { data, error: insertError } = await supabase
    .from('qr_codes')
    .insert({
      property_id: propertyId,
      type: 'reception',
      expires_at: expiresAt,
      rotates_every: '5 minutes',
      is_active: true,
    })
    .select()
    .single()

  if (insertError) throw insertError
  return data
}

export async function generateRoomQR(
  propertyId: string,
  roomId: string
): Promise<Tables<'qr_codes'>> {
  await checkDpa(propertyId)

  const supabase = createServiceRoleClient()

  const { error: updateError } = await supabase
    .from('qr_codes')
    .update({ is_active: false })
    .eq('property_id', propertyId)
    .eq('room_id', roomId)
    .eq('type', 'room')
    .eq('is_active', true)

  if (updateError) throw updateError

  const { data, error: insertError } = await supabase
    .from('qr_codes')
    .insert({
      property_id: propertyId,
      type: 'room',
      room_id: roomId,
      is_active: true,
      expires_at: null,
      rotates_every: null,
    })
    .select()
    .single()

  if (insertError) throw insertError
  return data
}

export async function deactivateRoomQR(
  propertyId: string,
  roomId: string
): Promise<void> {
  const supabase = createServiceRoleClient()

  const { error } = await supabase
    .from('qr_codes')
    .update({ is_active: false })
    .eq('property_id', propertyId)
    .eq('room_id', roomId)
    .eq('type', 'room')
    .eq('is_active', true)

  if (error) throw error
}
