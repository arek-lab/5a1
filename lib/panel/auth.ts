import { cache } from 'react'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { HotelRole } from '@/lib/panel/rbac'

export type HotelUser = {
  id: string
  propertyId: string
  role: HotelRole
  fullName: string | null
  email: string
}

export const getHotelUser = cache(async (): Promise<HotelUser | null> => {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const serviceRole = createServiceRoleClient()
  const { data } = await serviceRole
    .from('hotel_users')
    .select('id, property_id, role, full_name, email, status')
    .eq('auth_user_id', user.id)
    .eq('status', 'active')
    .single()

  if (!data) return null

  return {
    id: data.id,
    propertyId: data.property_id,
    role: data.role as HotelRole,
    fullName: data.full_name,
    email: data.email,
  }
})
