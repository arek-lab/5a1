import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/analytics/capture', () => ({
  captureEvent: vi.fn(),
}))

// Bypass the real (shared, cloud) rate limiter — this suite only asserts the
// captureEvent call, not rate-limit behavior, and must not consume budget that
// IT-2 depends on when run in the same process.
vi.mock('@/lib/rate-limit/scan', () => ({
  checkScanRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 5, retryAfter: 0 }),
}))

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { captureEvent } from '@/lib/analytics/capture'
import { GET as receptionGET } from '@/app/api/scan/reception/route'
import { GET as roomGET } from '@/app/api/scan/room/route'

const mockCaptureEvent = vi.mocked(captureEvent)

// Fixture IDs seeded in beforeAll; shared across tests
let propertyId: string
let roomId: string
let reservationId: string
let receptionQrToken: string
let capturedSessionId: string
let capturedCookieHeader: string

describe('guest_qr_scanned instrumentation (real Supabase)', () => {
  beforeAll(async () => {
    const db = createServiceRoleClient()

    const { data: property, error: propErr } = await db
      .from('properties')
      .insert({ name: 'IT-5 Test Property', timezone: 'UTC', dpa_signed_at: new Date().toISOString() })
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

    const { error: roomUpdateErr } = await db
      .from('rooms')
      .update({
        room_active_reservation_id: reservationId,
        valid_from: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        valid_until: tomorrow,
      })
      .eq('id', roomId)
    if (roomUpdateErr) throw roomUpdateErr

    const { data: receptionQr, error: qrErr } = await db
      .from('qr_codes')
      .insert({
        property_id: propertyId,
        type: 'reception',
        is_active: true,
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      })
      .select()
      .single()
    if (qrErr) throw qrErr
    receptionQrToken = receptionQr.init_token

    const { error: roomQrErr } = await db.from('qr_codes').insert({
      property_id: propertyId,
      type: 'room',
      room_id: roomId,
      is_active: true,
    })
    if (roomQrErr) throw roomQrErr
  }, 30_000)

  afterAll(async () => {
    const db = createServiceRoleClient()
    await db.from('rooms').update({ room_active_reservation_id: null }).eq('property_id', propertyId)
    await db.from('sessions').delete().eq('property_id', propertyId)
    await db.from('qr_codes').delete().eq('property_id', propertyId)
    await db.from('reservations').delete().eq('property_id', propertyId)
    await db.from('rooms').delete().eq('property_id', propertyId)
    await db.from('properties').delete().eq('id', propertyId)
  }, 30_000)

  beforeEach(() => {
    mockCaptureEvent.mockClear()
  })

  it('reception scan fires guest_qr_scanned with qr_type reception', async () => {
    const request = new NextRequest(
      `http://localhost/api/scan/reception?init_token=${receptionQrToken}`
    )
    const response = await receptionGET(request)

    const sessionCookie = response.cookies.getAll().find((c) => c.name === '__Host-session')
    capturedSessionId = sessionCookie!.value
    capturedCookieHeader = response.cookies.getAll().map((c) => `${c.name}=${c.value}`).join('; ')

    expect(mockCaptureEvent).toHaveBeenCalledWith(
      { name: 'guest_qr_scanned', properties: { qr_type: 'reception' } },
      { distinctId: capturedSessionId, propertyId }
    )
  }, 30_000)

  it('room scan fires guest_qr_scanned with qr_type room', async () => {
    const request = new NextRequest(`http://localhost/api/scan/room?room_id=${roomId}`, {
      headers: { cookie: capturedCookieHeader },
    })
    await roomGET(request)

    expect(mockCaptureEvent).toHaveBeenCalledWith(
      { name: 'guest_qr_scanned', properties: { qr_type: 'room' } },
      { distinctId: capturedSessionId, propertyId }
    )
  }, 30_000)
})
