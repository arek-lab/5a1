import type { Database } from '@/lib/supabase/database.types'

export type OrderStatus = Database['public']['Enums']['order_status']

export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  new: ['confirmed', 'rejected'],
  confirmed: ['fulfilled', 'rejected'],
  fulfilled: [],
  rejected: [],
}

export function isValidTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to)
}
