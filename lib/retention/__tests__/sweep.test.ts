import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { revokeExpiredSessions, deleteRetainedSessions, purgeOldAuditLogs } from '@/lib/retention/sweep'

let propertyId: string
let roomId: string
let reservationId: string
let serviceId: string
let freshSessionId: string
let midAgeSessionId: string
let oldSessionId: string
let orderId: string

describe('Retention sweep functions (real Supabase)', () => {
  beforeAll(async () => {
    const db = createServiceRoleClient()

    const { data: property, error: propErr } = await db
      .from('properties')
      .insert({ name: 'Sweep Test Property', timezone: 'UTC', dpa_signed_at: new Date().toISOString() })
      .select()
      .single()
    if (propErr) throw propErr
    propertyId = property.id

    const { data: room, error: roomErr } = await db
      .from('rooms')
      .insert({ property_id: propertyId, room_number: '901' })
      .select()
      .single()
    if (roomErr) throw roomErr
    roomId = room.id

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    const { data: reservation, error: resErr } = await db
      .from('reservations')
      .insert({
        property_id: propertyId,
        room_id: roomId,
        check_in: yesterday,
        check_out: tomorrow,
        source: 'direct',
        status: 'checked_in',
      })
      .select()
      .single()
    if (resErr) throw resErr
    reservationId = reservation.id

    const { data: service, error: svcErr } = await db
      .from('services')
      .insert({ property_id: propertyId, name: 'Sweep Test Service', category: 'other' })
      .select()
      .single()
    if (svcErr) throw svcErr
    serviceId = service.id

    const notExpired = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    const expiredOneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const expiredPast48h = new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString()

    const { data: fresh, error: freshErr } = await db
      .from('sessions')
      .insert({ property_id: propertyId, reservation_id: reservationId, expires_at: notExpired, revoked: false })
      .select()
      .single()
    if (freshErr) throw freshErr
    freshSessionId = fresh.id

    const { data: midAge, error: midErr } = await db
      .from('sessions')
      .insert({ property_id: propertyId, reservation_id: reservationId, expires_at: expiredOneHourAgo, revoked: false })
      .select()
      .single()
    if (midErr) throw midErr
    midAgeSessionId = midAge.id

    const { data: old, error: oldErr } = await db
      .from('sessions')
      .insert({ property_id: propertyId, reservation_id: reservationId, expires_at: expiredPast48h, revoked: true })
      .select()
      .single()
    if (oldErr) throw oldErr
    oldSessionId = old.id

    const { data: order, error: orderErr } = await db
      .from('orders')
      .insert({ property_id: propertyId, session_id: oldSessionId, service_id: serviceId })
      .select()
      .single()
    if (orderErr) throw orderErr
    orderId = order.id

    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { error: oldLogErr } = await db
      .from('audit_logs')
      .insert({ property_id: propertyId, event_type: 'sweep_test_old', target_id: reservationId, created_at: thirtyOneDaysAgo })
    if (oldLogErr) throw oldLogErr

    const { error: recentLogErr } = await db
      .from('audit_logs')
      .insert({ property_id: propertyId, event_type: 'sweep_test_recent', target_id: reservationId, created_at: oneDayAgo })
    if (recentLogErr) throw recentLogErr
  }, 30_000)

  afterAll(async () => {
    const db = createServiceRoleClient()
    await db.from('orders').delete().eq('property_id', propertyId)
    await db.from('audit_logs').delete().eq('property_id', propertyId)
    await db.from('sessions').delete().eq('property_id', propertyId)
    await db.from('reservations').delete().eq('property_id', propertyId)
    await db.from('services').delete().eq('property_id', propertyId)
    await db.from('rooms').delete().eq('property_id', propertyId)
    await db.from('properties').delete().eq('id', propertyId)
  }, 30_000)

  it('revokeExpiredSessions revokes an expired-not-yet-48h session but leaves it in place', async () => {
    const { count } = await revokeExpiredSessions()
    expect(count).toBeGreaterThanOrEqual(1)

    const db = createServiceRoleClient()
    const { data: midAge } = await db.from('sessions').select('revoked').eq('id', midAgeSessionId).single()
    expect(midAge?.revoked).toBe(true)

    const { data: fresh } = await db.from('sessions').select('revoked').eq('id', freshSessionId).single()
    expect(fresh?.revoked).toBe(false)
  }, 30_000)

  it('deleteRetainedSessions deletes a session past the 48h grace window and nulls referencing orders', async () => {
    const { count } = await deleteRetainedSessions()
    expect(count).toBeGreaterThanOrEqual(1)

    const db = createServiceRoleClient()
    const { data: old } = await db.from('sessions').select('id').eq('id', oldSessionId).maybeSingle()
    expect(old).toBeNull()

    const { data: order } = await db.from('orders').select('session_id').eq('id', orderId).single()
    expect(order?.session_id).toBeNull()

    const { data: midAge } = await db.from('sessions').select('id').eq('id', midAgeSessionId).maybeSingle()
    expect(midAge).not.toBeNull()
  }, 30_000)

  it('purgeOldAuditLogs deletes rows older than 30 days and keeps recent ones', async () => {
    const { count } = await purgeOldAuditLogs()
    expect(count).toBeGreaterThanOrEqual(1)

    const db = createServiceRoleClient()
    const { data: logs } = await db
      .from('audit_logs')
      .select('event_type')
      .eq('property_id', propertyId)
    expect(logs?.some((l) => l.event_type === 'sweep_test_old')).toBe(false)
    expect(logs?.some((l) => l.event_type === 'sweep_test_recent')).toBe(true)
  }, 30_000)
})
