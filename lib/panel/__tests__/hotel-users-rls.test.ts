import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { Database } from '@/lib/supabase/database.types'

const TEST_PASSWORD = 'it5-rls-test-P@ss-9284'

let propertyId: string
let targetUserId: string
let viewerAuthUserId: string
let adminAuthUserId: string
let viewerClient: SupabaseClient<Database>
let adminClient: SupabaseClient<Database>

function createAnonClient(): SupabaseClient<Database> {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )
}

describe('RLS: hotel_users mutation policy (real signed-in session, not service-role)', () => {
  beforeAll(async () => {
    const db = createServiceRoleClient()

    const { data: property, error: propErr } = await db
      .from('properties')
      .insert({ name: 'RLS Test Property', timezone: 'UTC' })
      .select()
      .single()
    if (propErr) throw propErr
    propertyId = property.id

    const { data: viewerAuth, error: viewerAuthErr } = await db.auth.admin.createUser({
      email: 'rls-viewer@it5.test',
      password: TEST_PASSWORD,
      email_confirm: true,
    })
    if (viewerAuthErr) throw viewerAuthErr
    viewerAuthUserId = viewerAuth.user.id

    const { data: adminAuth, error: adminAuthErr } = await db.auth.admin.createUser({
      email: 'rls-admin@it5.test',
      password: TEST_PASSWORD,
      email_confirm: true,
    })
    if (adminAuthErr) throw adminAuthErr
    adminAuthUserId = adminAuth.user.id

    const { error: viewerRowErr } = await db.from('hotel_users').insert({
      property_id: propertyId,
      auth_user_id: viewerAuthUserId,
      email: 'rls-viewer@it5.test',
      role: 'viewer',
      status: 'active',
    })
    if (viewerRowErr) throw viewerRowErr

    const { error: adminRowErr } = await db.from('hotel_users').insert({
      property_id: propertyId,
      auth_user_id: adminAuthUserId,
      email: 'rls-admin@it5.test',
      role: 'admin',
      status: 'active',
    })
    if (adminRowErr) throw adminRowErr

    const { data: target, error: targetErr } = await db
      .from('hotel_users')
      .insert({
        property_id: propertyId,
        email: 'rls-target-staff@it5.test',
        role: 'staff',
        status: 'active',
      })
      .select()
      .single()
    if (targetErr) throw targetErr
    targetUserId = target.id

    viewerClient = createAnonClient()
    const { error: viewerSignInErr } = await viewerClient.auth.signInWithPassword({
      email: 'rls-viewer@it5.test',
      password: TEST_PASSWORD,
    })
    if (viewerSignInErr) throw viewerSignInErr

    adminClient = createAnonClient()
    const { error: adminSignInErr } = await adminClient.auth.signInWithPassword({
      email: 'rls-admin@it5.test',
      password: TEST_PASSWORD,
    })
    if (adminSignInErr) throw adminSignInErr
  }, 30_000)

  afterAll(async () => {
    const db = createServiceRoleClient()
    await db.from('hotel_users').delete().eq('property_id', propertyId)
    await db.from('properties').delete().eq('id', propertyId)
    await db.auth.admin.deleteUser(viewerAuthUserId)
    await db.auth.admin.deleteUser(adminAuthUserId)
  }, 30_000)

  it('viewer session: UPDATE on hotel_users is rejected by RLS', async () => {
    const { error, count } = await viewerClient
      .from('hotel_users')
      .update({ role: 'admin' }, { count: 'exact' })
      .eq('id', targetUserId)

    expect(error).toBeNull()
    expect(count ?? 0).toBe(0)

    const db = createServiceRoleClient()
    const { data } = await db.from('hotel_users').select('role').eq('id', targetUserId).single()
    expect(data?.role).toBe('staff')
  }, 15_000)

  it('admin session: UPDATE on hotel_users succeeds', async () => {
    const { error, count } = await adminClient
      .from('hotel_users')
      .update({ role: 'viewer' }, { count: 'exact' })
      .eq('id', targetUserId)

    expect(error).toBeNull()
    expect(count).toBe(1)

    const db = createServiceRoleClient()
    const { data } = await db.from('hotel_users').select('role').eq('id', targetUserId).single()
    expect(data?.role).toBe('viewer')
  }, 15_000)
})
