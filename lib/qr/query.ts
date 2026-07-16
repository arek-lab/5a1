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
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) throw error
  const row = data?.[0]
  if (!row) return null

  return { id: row.id, initToken: row.init_token, expiresAt: row.expires_at }
}
