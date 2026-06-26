import type { Tables } from '@/lib/supabase/database.types'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { ReceptionScanError } from './errors'

export async function findAndConsumeToken(
  initToken: string
): Promise<{ ok: true; qr: Tables<'qr_codes'> } | { ok: false; error: ReceptionScanError }> {
  const supabase = createServiceRoleClient()

  const { data: row, error } = await supabase
    .from('qr_codes')
    .select('*')
    .eq('init_token', initToken)
    .eq('type', 'reception')
    .single()

  if (error || !row) return { ok: false, error: 'token_not_found' }

  if (row.expires_at !== null && new Date(row.expires_at) <= new Date()) {
    return { ok: false, error: 'token_expired' }
  }

  if (row.used_at !== null) return { ok: false, error: 'token_used' }

  const { data: updated, error: updateError } = await supabase
    .from('qr_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('id', row.id)
    .is('used_at', null)
    .select()

  if (updateError) throw updateError

  if (!updated || updated.length === 0) return { ok: false, error: 'token_used' }

  return { ok: true, qr: updated[0] }
}

export async function createReceptionSession(params: {
  propertyId: string
  authUserId: string
}): Promise<Tables<'sessions'>> {
  const supabase = createServiceRoleClient()

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('sessions')
    .insert({
      property_id: params.propertyId,
      auth_user_id: params.authUserId,
      auth_level: 1,
      expires_at: expiresAt,
      reception_scan_at: new Date().toISOString(),
      reservation_id: null,
    })
    .select()
    .single()

  if (error) throw error
  return data
}
