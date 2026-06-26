import { createServerClient as _createServerClient } from '@supabase/ssr'
import type { Database } from './database.types'

// Stub — S0.3 replaces the cookie handlers with next/headers read/write callbacks
// and wires this into middleware for set_tenant_context injection.
export function createServerClient() {
  return _createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => [],
        setAll: () => {},
      },
    }
  )
}
