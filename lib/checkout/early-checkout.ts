import { createServiceRoleClient } from '@/lib/supabase/service-role'

export async function processEarlyCheckout(reservationId: string): Promise<void> {
  const { error } = await createServiceRoleClient().rpc('process_early_checkout', {
    p_reservation_id: reservationId,
  })
  if (error) throw new Error(error.message)
}
