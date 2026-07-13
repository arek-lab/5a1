import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

export type GuestOrder = {
  id: string
  status: Database['public']['Enums']['order_status']
  createdAt: string
  scheduledAt: string | null
  note: string | null
  serviceName: string
}

export async function getGuestOrders(
  client: SupabaseClient<Database>,
  sessionId: string
): Promise<GuestOrder[]> {
  const { data, error } = await client
    .from('orders')
    .select('id, status, created_at, scheduled_at, note, services(name)')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).map(order => ({
    id: order.id,
    status: order.status,
    createdAt: order.created_at,
    scheduledAt: order.scheduled_at,
    note: order.note,
    serviceName: order.services?.name ?? '',
  }))
}
