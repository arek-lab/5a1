'use server'

import { revalidatePath } from 'next/cache'
import { getHotelUser, type HotelUser } from '@/lib/panel/auth'
import { canPerform, type HotelRole } from '@/lib/panel/rbac'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { sendInviteEmail } from '@/lib/invites/send-invite'

type ActionResult = { error?: string }

const INVITABLE_ROLES: HotelRole[] = ['admin', 'staff', 'viewer']
const CHANGEABLE_ROLES: HotelRole[] = ['admin', 'staff', 'viewer']
// Supabase Cloud caps Email OTP expiry at 24h (Dashboard hard limit) — the
// original 72h DoD isn't achievable without a custom invite-token flow.
const INVITE_TTL_MS = 24 * 60 * 60 * 1000

async function requireUsersWriteAccess(): Promise<HotelUser | null> {
  const hotelUser = await getHotelUser()
  if (!hotelUser || !canPerform(hotelUser.role, 'users', 'write')) {
    return null
  }
  return hotelUser
}

async function requireTransferAccess(): Promise<HotelUser | null> {
  const hotelUser = await getHotelUser()
  if (!hotelUser || !canPerform(hotelUser.role, 'transfer_ownership', 'full')) {
    return null
  }
  return hotelUser
}

function inviteRedirectUrl(propertyId: string): string {
  return `${process.env.NEXT_PUBLIC_APP_URL}/invite/accept?property_id=${propertyId}`
}

export async function inviteUser(formData: FormData): Promise<ActionResult> {
  const hotelUser = await requireUsersWriteAccess()
  if (!hotelUser) return { error: 'forbidden' }

  const email = String(formData.get('email') ?? '').trim()
  const role = String(formData.get('role') ?? '') as HotelRole
  if (!email) return { error: 'email_required' }
  if (!INVITABLE_ROLES.includes(role)) return { error: 'invalid_role' }

  const serviceRole = createServiceRoleClient()
  const { error: insertError } = await serviceRole.from('hotel_users').insert({
    property_id: hotelUser.propertyId,
    email,
    role,
    status: 'invited',
    invite_expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
  })
  if (insertError) {
    if (insertError.code === '23505') return { error: 'already_invited' }
    throw new Error(insertError.message)
  }

  const { error: sendError } = await sendInviteEmail(email, inviteRedirectUrl(hotelUser.propertyId))
  if (sendError) return { error: sendError }

  revalidatePath('/users')
  return {}
}

export async function resendInvite(userId: string): Promise<ActionResult> {
  const hotelUser = await requireUsersWriteAccess()
  if (!hotelUser) return { error: 'forbidden' }

  const serviceRole = createServiceRoleClient()
  const { data: target } = await serviceRole
    .from('hotel_users')
    .select('email, status')
    .eq('id', userId)
    .eq('property_id', hotelUser.propertyId)
    .single()
  if (!target || target.status !== 'invited') return { error: 'not_found' }

  const { error: updateError } = await serviceRole
    .from('hotel_users')
    .update({ invite_expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString() })
    .eq('id', userId)
  if (updateError) throw new Error(updateError.message)

  const { error: sendError } = await sendInviteEmail(
    target.email,
    inviteRedirectUrl(hotelUser.propertyId)
  )
  if (sendError) return { error: sendError }

  return {}
}

export async function changeRole(userId: string, newRole: HotelRole): Promise<ActionResult> {
  const hotelUser = await requireUsersWriteAccess()
  if (!hotelUser) return { error: 'forbidden' }

  if (!CHANGEABLE_ROLES.includes(newRole)) return { error: 'use_transfer_ownership' }

  const serviceRole = createServiceRoleClient()
  const { data: target } = await serviceRole
    .from('hotel_users')
    .select('role')
    .eq('id', userId)
    .eq('property_id', hotelUser.propertyId)
    .single()
  if (!target) return { error: 'not_found' }
  if (target.role === 'owner') return { error: 'use_transfer_ownership' }

  const { error: updateError } = await serviceRole
    .from('hotel_users')
    .update({ role: newRole })
    .eq('id', userId)
    .eq('property_id', hotelUser.propertyId)
  if (updateError) throw new Error(updateError.message)

  revalidatePath('/users')
  return {}
}

export async function deactivateUser(userId: string): Promise<ActionResult> {
  const hotelUser = await requireUsersWriteAccess()
  if (!hotelUser) return { error: 'forbidden' }

  if (userId === hotelUser.id) return { error: 'cannot_deactivate_self' }

  const serviceRole = createServiceRoleClient()
  const { data: target } = await serviceRole
    .from('hotel_users')
    .select('role')
    .eq('id', userId)
    .eq('property_id', hotelUser.propertyId)
    .single()
  if (!target) return { error: 'not_found' }

  if (target.role === 'owner') {
    const { count } = await serviceRole
      .from('hotel_users')
      .select('id', { count: 'exact', head: true })
      .eq('property_id', hotelUser.propertyId)
      .eq('role', 'owner')
      .eq('status', 'active')
    if ((count ?? 0) <= 1) return { error: 'last_owner_requires_transfer' }
  }

  const { error: updateError } = await serviceRole
    .from('hotel_users')
    .update({ status: 'deactivated' })
    .eq('id', userId)
    .eq('property_id', hotelUser.propertyId)
  if (updateError) throw new Error(updateError.message)

  revalidatePath('/users')
  return {}
}

export async function transferOwnership(targetUserId: string): Promise<ActionResult> {
  const hotelUser = await requireTransferAccess()
  if (!hotelUser) return { error: 'forbidden' }

  const serviceRole = createServiceRoleClient()
  const { error } = await serviceRole.rpc('transfer_hotel_ownership', {
    p_property_id: hotelUser.propertyId,
    p_current_owner_id: hotelUser.id,
    p_new_owner_id: targetUserId,
  })
  if (error) {
    if (error.message.includes('target_not_active')) return { error: 'target_not_active' }
    if (error.message.includes('not_current_owner')) return { error: 'forbidden' }
    throw new Error(error.message)
  }

  revalidatePath('/users')
  return {}
}

export async function reactivateUser(userId: string): Promise<ActionResult> {
  const hotelUser = await requireUsersWriteAccess()
  if (!hotelUser) return { error: 'forbidden' }

  const serviceRole = createServiceRoleClient()
  const { data: target } = await serviceRole
    .from('hotel_users')
    .select('status')
    .eq('id', userId)
    .eq('property_id', hotelUser.propertyId)
    .single()
  if (!target || target.status !== 'deactivated') return { error: 'not_found' }

  const { error: updateError } = await serviceRole
    .from('hotel_users')
    .update({ status: 'active' })
    .eq('id', userId)
    .eq('property_id', hotelUser.propertyId)
  if (updateError) throw new Error(updateError.message)

  revalidatePath('/users')
  return {}
}
