import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { revokeExpiredSessions, deleteRetainedSessions, purgeOldAuditLogs } from '@/lib/retention/sweep'

let propertyId: string
let roomId: string
let reservationId: string
let freshSessionId: string
let midAgeSessionId: string
let oldSessionId: string

describe('IT-8: Retention sweep end-to-end (real Supabase)', () => {
  beforeAll(async () => {
    const db = createServiceRoleClient()

    const { data: property, error: propErr } = await db
      .from('properties')
      .insert({ name: 'IT-8 Test Property', timezone: 'UTC', dpa_signed_at: new Date().toISOString() })
      .select()
      .single()
    if (propErr) throw propErr
    propertyId = property.id

    const { data: room, error: roomErr } = await db
      .from('rooms')
      .insert({ property_id: propertyId, room_number: '801' })
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
      .insert({ property_id: propertyId, reservation_id: reservationId, expires_at: expiredPast48h, revoked: false })
      .select()
      .single()
    if (oldErr) throw oldErr
    oldSessionId = old.id

    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { error: oldLogErr } = await db
      .from('audit_logs')
      .insert({ property_id: propertyId, event_type: 'it8_old', target_id: reservationId, created_at: thirtyOneDaysAgo })
    if (oldLogErr) throw oldLogErr

    const { error: recentLogErr } = await db
      .from('audit_logs')
      .insert({ property_id: propertyId, event_type: 'it8_recent', target_id: reservationId, created_at: oneDayAgo })
    if (recentLogErr) throw recentLogErr
  }, 30_000)

  afterAll(async () => {
    const db = createServiceRoleClient()
    await db.from('audit_logs').delete().eq('property_id', propertyId)
    await db.from('sessions').delete().eq('property_id', propertyId)
    await db.from('reservations').delete().eq('property_id', propertyId)
    await db.from('rooms').delete().eq('property_id', propertyId)
    await db.from('properties').delete().eq('id', propertyId)
  }, 30_000)

  it('runs all three sweep rules and leaves the expected state behind', async () => {
    await revokeExpiredSessions()
    await deleteRetainedSessions()
    await purgeOldAuditLogs()

    const db = createServiceRoleClient()

    const { data: fresh } = await db.from('sessions').select('revoked').eq('id', freshSessionId).single()
    expect(fresh?.revoked).toBe(false)

    const { data: midAge } = await db.from('sessions').select('revoked').eq('id', midAgeSessionId).single()
    expect(midAge?.revoked).toBe(true)

    const { data: old } = await db.from('sessions').select('id').eq('id', oldSessionId).maybeSingle()
    expect(old).toBeNull()

    const { data: logs } = await db
      .from('audit_logs')
      .select('event_type')
      .eq('property_id', propertyId)
    expect(logs?.some((l) => l.event_type === 'it8_old')).toBe(false)
    expect(logs?.some((l) => l.event_type === 'it8_recent')).toBe(true)
  }, 30_000)
})
