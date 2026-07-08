'use server'

import { revalidatePath } from 'next/cache'
import { getHotelUser, type HotelUser } from '@/lib/panel/auth'
import { canPerform } from '@/lib/panel/rbac'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { isValidTransition, type OrderStatus } from '@/lib/orders/status'

type ActionResult = { error?: string }

async function requireOrdersStatusAccess(): Promise<HotelUser | null> {
  const hotelUser = await getHotelUser()
  if (!hotelUser || !canPerform(hotelUser.role, 'orders_status', 'write')) {
    return null
  }
  return hotelUser
}

export async function updateOrderStatus(
  orderId: string,
  newStatus: OrderStatus
): Promise<ActionResult> {
  const hotelUser = await requireOrdersStatusAccess()
  if (!hotelUser) return { error: 'forbidden' }

  const serviceRole = createServiceRoleClient()

  const { data: order } = await serviceRole
    .from('orders')
    .select('status')
    .eq('id', orderId)
    .eq('property_id', hotelUser.propertyId)
    .single()
  if (!order) return { error: 'notFound' }

  if (!isValidTransition(order.status, newStatus)) {
    return { error: 'invalidTransition' }
  }

  // Last-write-wins (decyzja HITL): no `WHERE status = expected` guard.
  const { error } = await serviceRole
    .from('orders')
    .update({ status: newStatus })
    .eq('id', orderId)
    .eq('property_id', hotelUser.propertyId)
  if (error) return { error: 'updateFailed' }

  revalidatePath('/orders')
  return {}
}
