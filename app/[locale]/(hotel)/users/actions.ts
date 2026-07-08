'use server'

import { getHotelUser, type HotelUser } from '@/lib/panel/auth'
import { canPerform, type HotelRole } from '@/lib/panel/rbac'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { sendInviteEmail } from '@/lib/invites/send-invite'

type ActionResult = { error?: string }

const INVITABLE_ROLES: HotelRole[] = ['admin', 'staff', 'viewer']
const INVITE_TTL_MS = 72 * 60 * 60 * 1000

async function requireUsersWriteAccess(): Promise<HotelUser | null> {
  const hotelUser = await getHotelUser()
  if (!hotelUser || !canPerform(hotelUser.role, 'users', 'write')) {
    return null
  }
  return hotelUser
}

function inviteRedirectUrl(): string {
  return `${process.env.NEXT_PUBLIC_APP_URL}/invite/accept`
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

  const { error: sendError } = await sendInviteEmail(email, inviteRedirectUrl())
  if (sendError) return { error: sendError }

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

  const { error: sendError } = await sendInviteEmail(target.email, inviteRedirectUrl())
  if (sendError) return { error: sendError }

  return {}
}
