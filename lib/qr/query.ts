import { createServerClient } from '@/lib/supabase/server'

export type ActiveReceptionQr = {
  id: string
  initToken: string
  expiresAt: string | null
}

export async function getActiveReceptionQr(propertyId: string): Promise<ActiveReceptionQr | null> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from('qr_codes')
    .select('id, init_token, expires_at')
    .eq('property_id', propertyId)
    .eq('type', 'reception')
    .eq('is_active', true)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  return { id: data.id, initToken: data.init_token, expiresAt: data.expires_at }
}
