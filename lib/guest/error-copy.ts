import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type ErrorGroup = 'expired' | 'invalid' | 'insufficient_access' | 'generic'

const EXPIRED = new Set(['token_expired', 'session_expired'])
const INVALID = new Set([
  'token_not_found',
  'token_used',
  'missing_session_cookie',
  'session_not_found',
  'session_revoked',
  'auth_failed',
])
const INSUFFICIENT_ACCESS = new Set(['insufficient_auth', 'wrong_auth_level'])

export function resolveErrorGroup(type: string | undefined): ErrorGroup {
  if (type === undefined) return 'generic'
  if (EXPIRED.has(type)) return 'expired'
  if (INVALID.has(type)) return 'invalid'
  if (INSUFFICIENT_ACCESS.has(type)) return 'insufficient_access'
  return 'generic'
}

export type ErrorPageBranding = {
  name: string
  logoUrl: string | null
  phoneReception: string | null
}

export async function getErrorPageBranding(
  propertyId: string | undefined
): Promise<ErrorPageBranding | null> {
  if (!propertyId) return null

  const supabase = createServiceRoleClient()
  const { data: property } = await supabase
    .from('properties')
    .select('name, logo_url, phone_reception')
    .eq('id', propertyId)
    .maybeSingle()

  if (!property) return null

  return {
    name: property.name,
    logoUrl: property.logo_url,
    phoneReception: property.phone_reception,
  }
}
