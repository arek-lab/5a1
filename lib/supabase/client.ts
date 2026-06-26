import { createBrowserClient as _createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types'

// Stub — S0.3 extends this with session-aware behaviour if needed.
export function createBrowserClient() {
  return _createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )
}
