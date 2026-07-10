import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { Database } from '@/lib/supabase/database.types'

const TEST_PASSWORD = 'it-signup-test-P@ss-4471'

let otherPropertyId: string
let newPropertyId: string
let newOwnerAuthUserId: string
let newOwnerClient: SupabaseClient<Database>

function createAnonClient(): SupabaseClient<Database> {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )
}

describe('IT-signup: create_hotel_and_owner RPC + RLS isolation (real signed-in session)', () => {
  beforeAll(async () => {
    const db = createServiceRoleClient()

    const { data: otherProperty, error: otherPropErr } = await db
      .from('properties')
      .insert({ name: 'IT-signup Other Property', timezone: 'UTC' })
      .select()
      .single()
    if (otherPropErr) throw otherPropErr
    otherPropertyId = otherProperty.id

    const { data: otherOwnerAuth, error: otherOwnerAuthErr } = await db.auth.admin.createUser({
      email: 'it-signup-other-owner@it5.test',
      password: TEST_PASSWORD,
      email_confirm: true,
    })
    if (otherOwnerAuthErr) throw otherOwnerAuthErr

    const { error: otherOwnerRowErr } = await db.from('hotel_users').insert({
      property_id: otherPropertyId,
      auth_user_id: otherOwnerAuth.user.id,
      email: 'it-signup-other-owner@it5.test',
      role: 'owner',
      status: 'active',
    })
    if (otherOwnerRowErr) throw otherOwnerRowErr

    const { data: newOwnerAuth, error: newOwnerAuthErr } = await db.auth.admin.createUser({
      email: 'it-signup-new-owner@it5.test',
      password: TEST_PASSWORD,
      email_confirm: true,
    })
    if (newOwnerAuthErr) throw newOwnerAuthErr
    newOwnerAuthUserId = newOwnerAuth.user.id
  }, 30_000)

  afterAll(async () => {
    const db = createServiceRoleClient()
    if (newPropertyId) {
      await db.from('hotel_users').delete().eq('property_id', newPropertyId)
      await db.from('properties').delete().eq('id', newPropertyId)
    }
    await db.from('hotel_users').delete().eq('property_id', otherPropertyId)
    await db.from('properties').delete().eq('id', otherPropertyId)
    const { data: otherOwnerAuth } = await db.auth.admin.listUsers()
    const otherOwner = otherOwnerAuth.users.find((u) => u.email === 'it-signup-other-owner@it5.test')
    if (otherOwner) await db.auth.admin.deleteUser(otherOwner.id)
    if (newOwnerAuthUserId) await db.auth.admin.deleteUser(newOwnerAuthUserId)
  }, 30_000)

  it('create_hotel_and_owner: atomically creates properties + hotel_users(role=owner)', async () => {
    const db = createServiceRoleClient()
    const { data: propertyId, error } = await db.rpc('create_hotel_and_owner', {
      p_auth_user_id: newOwnerAuthUserId,
      p_email: 'it-signup-new-owner@it5.test',
      p_hotel_name: 'IT-signup New Hotel',
    })
    expect(error).toBeNull()
    expect(propertyId).toBeTruthy()
    newPropertyId = propertyId as string

    const { data: property } = await db
      .from('properties')
      .select('setup_completed, dpa_signed_at')
      .eq('id', newPropertyId)
      .single()
    expect(property?.setup_completed).toBe(false)
    expect(property?.dpa_signed_at).toBeNull()

    const { data: hotelUser } = await db
      .from('hotel_users')
      .select('role, status, auth_user_id')
      .eq('property_id', newPropertyId)
      .eq('auth_user_id', newOwnerAuthUserId)
      .single()
    expect(hotelUser?.role).toBe('owner')
    expect(hotelUser?.status).toBe('active')
  }, 15_000)

  it('RLS isolation: new owner sees only their own property, not the unrelated one', async () => {
    newOwnerClient = createAnonClient()
    const { error: signInErr } = await newOwnerClient.auth.signInWithPassword({
      email: 'it-signup-new-owner@it5.test',
      password: TEST_PASSWORD,
    })
    if (signInErr) throw signInErr

    const { data: visibleProperties, error } = await newOwnerClient.from('properties').select('id')

    expect(error).toBeNull()
    const visibleIds = (visibleProperties ?? []).map((p) => p.id)
    expect(visibleIds).toContain(newPropertyId)
    expect(visibleIds).not.toContain(otherPropertyId)
  }, 15_000)
})
