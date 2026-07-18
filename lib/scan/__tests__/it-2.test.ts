import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { NextRequest } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { GET as receptionGET } from '@/app/api/scan/reception/route'
import { GET as roomGET } from '@/app/api/scan/room/route'

// Fixture IDs seeded in beforeAll; shared across tests
let propertyId: string
let roomId: string
let reservationId: string

// State captured from Test 1 and used in Tests 2, 3
let receptionQrToken: string
let capturedSessionId: string
let capturedCookieHeader: string

describe('IT-2: QR scan route handlers (real Supabase)', () => {
  beforeAll(async () => {
    const db = createServiceRoleClient()

    const { data: property, error: propErr } = await db
      .from('properties')
      .insert({ name: 'IT-2 Test Property', timezone: 'UTC', dpa_signed_at: new Date().toISOString() })
      .select()
      .single()
    if (propErr) throw propErr
    propertyId = property.id

    const { data: room, error: roomErr } = await db
      .from('rooms')
      .insert({ property_id: propertyId, room_number: '101' })
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

    // Room: active reservation + valid window covering now()
    const { error: roomUpdateErr } = await db
      .from('rooms')
      .update({
        room_active_reservation_id: reservationId,
        valid_from: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        valid_until: tomorrow,
      })
      .eq('id', roomId)
    if (roomUpdateErr) throw roomUpdateErr

    // Reception QR: single-use token, expires in 15 min
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

    // Room QR: multi-use, no TTL
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
    // Break rooms→reservations circular FK before deleting reservations
    await db.from('rooms').update({ room_active_reservation_id: null }).eq('property_id', propertyId)
    await db.from('sessions').delete().eq('property_id', propertyId)
    await db.from('qr_codes').delete().eq('property_id', propertyId)
    await db.from('reservations').delete().eq('property_id', propertyId)
    await db.from('rooms').delete().eq('property_id', propertyId)
    await db.from('properties').delete().eq('id', propertyId)
  }, 30_000)

  it('Test 1 — happy path: valid reception scan', async () => {
    const request = new NextRequest(
      `http://localhost/api/scan/reception?init_token=${receptionQrToken}`
    )
    const response = await receptionGET(request)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toMatch(/^http:\/\/localhost:3000\/$/)

    const allCookies = response.cookies.getAll()
    const sessionCookie = allCookies.find((c) => c.name === '__Host-session')
    expect(sessionCookie).toBeDefined()
    expect(sessionCookie?.httpOnly).toBe(true)
    expect(sessionCookie?.secure).toBe(true)
    expect(sessionCookie?.sameSite).toBe('lax')
    expect(sessionCookie?.path).toBe('/')
    // Persistent cookie (not a browser-session one): expiry must mirror the sessions
    // row's expires_at (~24h at auth_level 1), or mobile OSes killing the browser
    // process wipe the cookie mid-stay while the row is still valid.
    const receptionExpiresMs = new Date(sessionCookie!.expires!).getTime()
    expect(receptionExpiresMs).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000)
    expect(receptionExpiresMs).toBeLessThan(Date.now() + 25 * 60 * 60 * 1000)

    // Capture for downstream tests (Tests 2 and 3)
    capturedSessionId = sessionCookie!.value
    capturedCookieHeader = allCookies.map((c) => `${c.name}=${c.value}`).join('; ')

    const db = createServiceRoleClient()
    const { data: session } = await db.from('sessions').select().eq('id', capturedSessionId).single()
    expect(session?.auth_level).toBe(1)
    expect(session?.property_id).toBe(propertyId)

    const { data: qr } = await db
      .from('qr_codes')
      .select('used_at')
      .eq('init_token', receptionQrToken)
      .single()
    expect(qr?.used_at).not.toBeNull()
  }, 30_000)

  it('Test 2 — replay: same token used twice', async () => {
    const request = new NextRequest(
      `http://localhost/api/scan/reception?init_token=${receptionQrToken}`
    )
    const response = await receptionGET(request)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('error')
    expect(response.headers.get('location')).toContain('token_used')
  }, 15_000)

  it('Test 3 — room step-up within valid window', async () => {
    // Supabase auth cookies from Test 1 are forwarded so refreshSession() can succeed
    const request = new NextRequest(`http://localhost/api/scan/room?room_id=${roomId}`, {
      headers: { cookie: capturedCookieHeader },
    })
    const response = await roomGET(request)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toMatch(/^http:\/\/localhost:3000\/$/)

    const db = createServiceRoleClient()
    const { data: session } = await db.from('sessions').select().eq('id', capturedSessionId).single()
    expect(session?.auth_level).toBe(2)
    expect(session?.room_id).toBe(roomId)
    expect(session?.reservation_id).toBe(reservationId)

    // Step-up must re-issue the cookie with the upgraded expiry (check-out + 2h),
    // matching the sessions row written by upgradeSession.
    const upgradedCookie = response.cookies.get('__Host-session')
    expect(upgradedCookie?.value).toBe(capturedSessionId)
    expect(new Date(upgradedCookie!.expires!).getTime()).toBe(new Date(session!.expires_at).getTime())
  }, 30_000)

  it('Test 4 — room step-up outside valid window', async () => {
    const db = createServiceRoleClient()

    // Insert a fresh auth_level=1 session directly — reception token was consumed in Test 1
    const { data: freshSession, error: sessErr } = await db
      .from('sessions')
      .insert({
        property_id: propertyId,
        auth_level: 1,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        reception_scan_at: new Date().toISOString(),
      })
      .select()
      .single()
    if (sessErr) throw sessErr

    // Move room access window entirely to the past
    await db
      .from('rooms')
      .update({
        valid_from: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        valid_until: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      })
      .eq('id', roomId)

    // validateRoomScan returns outside_window before any auth ops, so no Supabase tokens needed
    const request = new NextRequest(`http://localhost/api/scan/room?room_id=${roomId}`, {
      headers: { cookie: `__Host-session=${freshSession.id}` },
    })
    const response = await roomGET(request)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('error')
    expect(response.headers.get('location')).toContain('outside_window')
  }, 15_000)

  it('Test 5 — wrong_auth_level bounces to /scan twice, then to /error on the 3rd attempt', async () => {
    const db = createServiceRoleClient()

    // auth_level 2 with no room_id assigned -> does not match the scanned room, so this
    // hits wrong_auth_level, not the already_active no-op (which requires a matching room_id).
    const { data: wrongLevelSession, error: sessErr } = await db
      .from('sessions')
      .insert({
        property_id: propertyId,
        auth_level: 2,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        reception_scan_at: new Date().toISOString(),
      })
      .select()
      .single()
    if (sessErr) throw sessErr

    let cookieHeader = `__Host-session=${wrongLevelSession.id}`

    const attempt1 = await roomGET(
      new NextRequest(`http://localhost/api/scan/room?room_id=${roomId}`, {
        headers: { cookie: cookieHeader },
      })
    )
    expect(attempt1.headers.get('location')).toContain('/scan?retry=1')
    const retryCookie1 = attempt1.cookies.get('scan_retry_count')
    expect(retryCookie1?.value).toBe('1')
    cookieHeader = `__Host-session=${wrongLevelSession.id}; scan_retry_count=${retryCookie1!.value}`

    const attempt2 = await roomGET(
      new NextRequest(`http://localhost/api/scan/room?room_id=${roomId}`, {
        headers: { cookie: cookieHeader },
      })
    )
    expect(attempt2.headers.get('location')).toContain('/scan?retry=1')
    const retryCookie2 = attempt2.cookies.get('scan_retry_count')
    expect(retryCookie2?.value).toBe('2')
    cookieHeader = `__Host-session=${wrongLevelSession.id}; scan_retry_count=${retryCookie2!.value}`

    const attempt3 = await roomGET(
      new NextRequest(`http://localhost/api/scan/room?room_id=${roomId}`, {
        headers: { cookie: cookieHeader },
      })
    )
    expect(attempt3.headers.get('location')).toContain('/error')
    expect(attempt3.headers.get('location')).toContain('wrong_auth_level')
    expect(attempt3.cookies.get('scan_retry_count')?.value).toBeFalsy()

    await db.from('sessions').delete().eq('id', wrongLevelSession.id)
  }, 30_000)
})
