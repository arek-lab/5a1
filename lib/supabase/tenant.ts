import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { createServiceRoleClient } from './service-role'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Returns a service_role client, validated against the tenant headers set by the middleware.
// Throws if x-property-id header is absent or not a valid UUID.
export async function withTenantContext(
  headers: Pick<Headers, 'get'>
): Promise<SupabaseClient<Database>> {
  const propertyId = headers.get('x-property-id')
  const sessionId = headers.get('x-session-id')

  if (!propertyId || !UUID_RE.test(propertyId)) {
    throw new Error('Missing or invalid x-property-id header')
  }
  if (sessionId !== null && !UUID_RE.test(sessionId)) {
    throw new Error('Invalid x-session-id header')
  }

  // service_role bypasses RLS entirely (BYPASSRLS), so current_setting('app.property_id') —
  // set by set_tenant_context — is never evaluated for this client. Tenant isolation here is
  // enforced solely by the explicit .eq('property_id', …) filters in each caller's query; no
  // RPC round-trip is needed to establish it.
  return createServiceRoleClient()
}
