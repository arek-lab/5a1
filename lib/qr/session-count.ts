import { createServerClient } from '@/lib/supabase/server'

export async function getActiveReceptionSessionCount(propertyId: string): Promise<number> {
  const supabase = await createServerClient()

  const { data: activeQr } = await supabase
    .from('qr_codes')
    .select('created_at')
    .eq('property_id', propertyId)
    .eq('type', 'reception')
    .eq('is_active', true)
    .maybeSingle()

  if (!activeQr) return 0

  const { count, error } = await supabase
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .eq('property_id', propertyId)
    .gte('auth_level', 1)
    .eq('revoked', false)
    .gt('expires_at', new Date().toISOString())
    .gte('reception_scan_at', activeQr.created_at)

  if (error) throw error
  return count ?? 0
}
