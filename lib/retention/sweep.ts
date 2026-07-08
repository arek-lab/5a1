import { createServiceRoleClient } from '@/lib/supabase/service-role'

// TODO(S4.x): add AI-chat retention sweep once concierge message storage exists.

export async function revokeExpiredSessions(): Promise<{ count: number }> {
  const db = createServiceRoleClient()
  const { error, count } = await db
    .from('sessions')
    .update({ revoked: true }, { count: 'exact' })
    .eq('revoked', false)
    .lte('expires_at', new Date().toISOString())
  if (error) throw new Error(error.message)
  return { count: count ?? 0 }
}

export async function deleteRetainedSessions(): Promise<{ count: number }> {
  const db = createServiceRoleClient()
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  const { error, count } = await db
    .from('sessions')
    .delete({ count: 'exact' })
    .lte('expires_at', cutoff)
  if (error) throw new Error(error.message)
  return { count: count ?? 0 }
}

export async function purgeOldAuditLogs(): Promise<{ count: number }> {
  const db = createServiceRoleClient()
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { error, count } = await db
    .from('audit_logs')
    .delete({ count: 'exact' })
    .lte('created_at', cutoff)
  if (error) throw new Error(error.message)
  return { count: count ?? 0 }
}
