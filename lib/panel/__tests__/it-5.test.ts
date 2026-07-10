import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { HotelUser } from '@/lib/panel/auth'

vi.mock('@/lib/panel/auth', () => ({
  getHotelUser: vi.fn(),
}))
vi.mock('@/lib/invites/send-invite', () => ({
  sendInviteEmail: vi.fn(async () => ({})),
}))
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { getHotelUser } from '@/lib/panel/auth'
import {
  inviteUser,
  deactivateUser,
  transferOwnership,
} from '@/app/[locale]/(hotel)/users/actions'

const mockGetHotelUser = vi.mocked(getHotelUser)

let propertyId: string
let ownerId: string
let staffId: string
let invitedEmail: string

function asCaller(overrides: Partial<HotelUser>): void {
  mockGetHotelUser.mockResolvedValue({
    id: ownerId,
    propertyId,
    role: 'owner',
    fullName: 'Owner',
    email: 'owner@it5.test',
    ...overrides,
  })
}

describe('IT-5: Panel users full cycle (real Supabase, RLS active elsewhere via service-role fixtures)', () => {
  beforeAll(async () => {
    const db = createServiceRoleClient()

    const { data: property, error: propErr } = await db
      .from('properties')
      .insert({ name: 'IT-5 Test Property', timezone: 'UTC' })
      .select()
      .single()
    if (propErr) throw propErr
    propertyId = property.id

    const { data: owner, error: ownerErr } = await db
      .from('hotel_users')
      .insert({
        property_id: propertyId,
        email: 'owner@it5.test',
        full_name: 'Owner',
        role: 'owner',
        status: 'active',
      })
      .select()
      .single()
    if (ownerErr) throw ownerErr
    ownerId = owner.id

    const { data: staff, error: staffErr } = await db
      .from('hotel_users')
      .insert({
        property_id: propertyId,
        email: 'staff@it5.test',
        full_name: 'Staff',
        role: 'staff',
        status: 'active',
      })
      .select()
      .single()
    if (staffErr) throw staffErr
    staffId = staff.id

    invitedEmail = 'invited-admin@it5.test'
  }, 30_000)

  afterAll(async () => {
    const db = createServiceRoleClient()
    await db.from('hotel_users').delete().eq('property_id', propertyId)
    await db.from('properties').delete().eq('id', propertyId)
  }, 30_000)

  it('Test 1 — inviteUser: owner invites a new admin, row inserted as invited', async () => {
    asCaller({ role: 'owner' })

    const formData = new FormData()
    formData.set('email', invitedEmail)
    formData.set('role', 'admin')

    const result = await inviteUser(formData)
    expect(result).toEqual({})

    const db = createServiceRoleClient()
    const { data } = await db
      .from('hotel_users')
      .select('status, role')
      .eq('property_id', propertyId)
      .eq('email', invitedEmail)
      .single()
    expect(data?.status).toBe('invited')
    expect(data?.role).toBe('admin')
  }, 15_000)

  it('Test 2 — accept simulated: direct service-role activation (no real invite link click)', async () => {
    const db = createServiceRoleClient()
    const { error } = await db
      .from('hotel_users')
      .update({ status: 'active' })
      .eq('property_id', propertyId)
      .eq('email', invitedEmail)
    expect(error).toBeNull()

    const { data } = await db
      .from('hotel_users')
      .select('status')
      .eq('property_id', propertyId)
      .eq('email', invitedEmail)
      .single()
    expect(data?.status).toBe('active')
  }, 15_000)

  it('Test 3 — deactivateUser: owner deactivates Staff, content retained (row not deleted)', async () => {
    asCaller({ role: 'owner' })

    const result = await deactivateUser(staffId)
    expect(result).toEqual({})

    const db = createServiceRoleClient()
    const { data } = await db.from('hotel_users').select('status').eq('id', staffId).single()
    expect(data?.status).toBe('deactivated')
  }, 15_000)

  it('Test 4 — deactivateUser: rejects deactivating the only active Owner', async () => {
    const setupDb = createServiceRoleClient()
    const { data: invitedAdminRow } = await setupDb
      .from('hotel_users')
      .select('id')
      .eq('property_id', propertyId)
      .eq('email', invitedEmail)
      .single()

    asCaller({ id: invitedAdminRow!.id, role: 'admin' })

    const result = await deactivateUser(ownerId)
    expect(result).toEqual({ error: 'last_owner_requires_transfer' })

    const db = createServiceRoleClient()
    const { data } = await db.from('hotel_users').select('status').eq('id', ownerId).single()
    expect(data?.status).toBe('active')
  }, 15_000)

  it('Test 5 — transferOwnership: owner transfers to the now-active invited admin', async () => {
    asCaller({ role: 'owner' })

    const db = createServiceRoleClient()
    const { data: newOwnerRow } = await db
      .from('hotel_users')
      .select('id')
      .eq('property_id', propertyId)
      .eq('email', invitedEmail)
      .single()
    const newOwnerId = newOwnerRow!.id

    const result = await transferOwnership(newOwnerId)
    expect(result).toEqual({})

    const { data: oldOwner } = await db.from('hotel_users').select('role').eq('id', ownerId).single()
    expect(oldOwner?.role).toBe('admin')

    const { data: newOwner } = await db.from('hotel_users').select('role').eq('id', newOwnerId).single()
    expect(newOwner?.role).toBe('owner')
  }, 15_000)

  it('Test 6 — deactivateUser: old Owner (now Admin) can be deactivated since a second Owner exists', async () => {
    const db = createServiceRoleClient()
    const { data: newOwnerRow } = await db
      .from('hotel_users')
      .select('id')
      .eq('property_id', propertyId)
      .eq('email', invitedEmail)
      .single()

    asCaller({ id: newOwnerRow!.id, role: 'owner' })

    const result = await deactivateUser(ownerId)
    expect(result).toEqual({})

    const { data: oldOwner } = await db.from('hotel_users').select('status').eq('id', ownerId).single()
    expect(oldOwner?.status).toBe('deactivated')
  }, 15_000)
})
