import { createServiceRoleClient } from '@/lib/supabase/service-role'

export async function getPulseMetrics(): Promise<{
  guestsOnline: number
  orders24h: number
  qrScans24h: number
  operators7d: number
}> {
  const db = createServiceRoleClient()
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [
    { count: guestsOnline, error: guestsErr },
    { count: orders24h, error: ordersErr },
    { count: receptionScans24h, error: receptionErr },
    { count: roomScans24h, error: roomErr },
    { count: operators7d, error: operatorsErr },
  ] = await Promise.all([
    db
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('revoked', false)
      .gt('expires_at', new Date().toISOString()),
    db
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .gt('created_at', oneDayAgo),
    db
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .gt('reception_scan_at', oneDayAgo),
    db
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .gt('room_scan_at', oneDayAgo),
    db
      .from('hotel_users')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .gt('last_login_at', sevenDaysAgo),
  ])

  const error = guestsErr ?? ordersErr ?? receptionErr ?? roomErr ?? operatorsErr
  if (error) throw new Error(error.message)

  return {
    guestsOnline: guestsOnline ?? 0,
    orders24h: orders24h ?? 0,
    qrScans24h: (receptionScans24h ?? 0) + (roomScans24h ?? 0),
    operators7d: operators7d ?? 0,
  }
}
