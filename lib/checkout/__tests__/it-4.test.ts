import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { processEarlyCheckout } from '@/lib/checkout/early-checkout'

// next-intl uses `import 'next/server'` (no .js) which Node/vitest can't resolve —
// mock it before proxy.ts is evaluated so the real module never loads.
vi.mock('next-intl/middleware', () => ({ default: () => () => new Response() }))

import proxy from '@/proxy'
import { GET } from '@/app/api/scan/room/route'

let propertyId: string
let roomId: string
let reservationId: string
let sessionId: string
let qrId: string

describe('IT-4: Early checkout (real Supabase)', () => {
  beforeAll(async () => {
    const db = createServiceRoleClient()

    const { data: property, error: propErr } = await db
      .from('properties')
      .insert({ name: 'IT-4 Test Property', timezone: 'UTC', dpa_signed_at: new Date().toISOString() })
      .select()
      .single()
    if (propErr) throw propErr
    propertyId = property.id

    const { data: room, error: roomErr } = await db
      .from('rooms')
      .insert({ property_id: propertyId, room_number: '201' })
      .select()
      .single()
    if (roomErr) throw roomErr
    roomId = room.id

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()

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

    await db
      .from('rooms')
      .update({
        room_active_reservation_id: reservationId,
        valid_from: twoHoursAgo,
        valid_until: tomorrow,
      })
      .eq('id', roomId)

    const { data: qr, error: qrErr } = await db
      .from('qr_codes')
      .insert({ property_id: propertyId, type: 'room', room_id: roomId, is_active: true })
      .select()
      .single()
    if (qrErr) throw qrErr
    qrId = qr.id

    const { data: session, error: sessErr } = await db
      .from('sessions')
      .insert({
        property_id: propertyId,
        auth_level: 2,
        reservation_id: reservationId,
        room_id: roomId,
        expires_at: tomorrow,
        revoked: false,
      })
      .select()
      .single()
    if (sessErr) throw sessErr
    sessionId = session.id
  }, 30_000)

  afterAll(async () => {
    const db = createServiceRoleClient()
    await db.from('rooms').update({ room_active_reservation_id: null }).eq('property_id', propertyId)
    await db.from('sessions').delete().eq('property_id', propertyId)
    await db.from('audit_logs').delete().eq('target_id', reservationId)
    await db.from('qr_codes').delete().eq('property_id', propertyId)
    await db.from('reservations').delete().eq('property_id', propertyId)
    await db.from('rooms').delete().eq('property_id', propertyId)
    await db.from('properties').delete().eq('id', propertyId)
  }, 30_000)

  it('Test 1 — processEarlyCheckout: all five DB changes committed atomically', async () => {
    await expect(processEarlyCheckout(reservationId)).resolves.toBeUndefined()

    const db = createServiceRoleClient()

    const { data: res } = await db.from('reservations').select('status').eq('id', reservationId).single()
    expect(res?.status).toBe('checked_out')

    const { data: sess } = await db.from('sessions').select('revoked').eq('id', sessionId).single()
    expect(sess?.revoked).toBe(true)

    const { data: room } = await db.from('rooms').select('valid_until').eq('id', roomId).single()
    expect(new Date(room!.valid_until!).getTime()).toBeLessThanOrEqual(Date.now() + 5000)

    const { data: qr } = await db.from('qr_codes').select('is_active').eq('id', qrId).single()
    expect(qr?.is_active).toBe(false)

    const { data: logs } = await db
      .from('audit_logs')
      .select('event_type')
      .eq('target_id', reservationId)
    expect(logs?.length).toBeGreaterThanOrEqual(1)
    expect(logs?.some((l) => l.event_type === 'early_checkout')).toBe(true)
  }, 30_000)

  it('Test 2 — revoked session → 401 from proxy', async () => {
    const req = new NextRequest('http://localhost:3000/api/scan/reception', {
      headers: { Cookie: `__Host-session=${sessionId}` },
    })
    const res = await proxy(req)
    expect(res.status).toBe(401)
  }, 15_000)

  it('Test 3 — room QR scan with revoked session → session_revoked error', async () => {
    const req = new NextRequest(`http://localhost:3000/api/scan/room?room_id=${roomId}`, {
      headers: { cookie: `__Host-session=${sessionId}` },
    })
    const res = await GET(req)
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('session_revoked')
  }, 15_000)

  it('Test 4 — processEarlyCheckout: throws on non-existent reservation; no audit_log entry', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000001'
    await expect(processEarlyCheckout(fakeId)).rejects.toThrow('reservation_not_found')

    const db = createServiceRoleClient()
    const { data: logs } = await db.from('audit_logs').select('id').eq('target_id', fakeId)
    expect(logs?.length).toBe(0)
  }, 15_000)
})
