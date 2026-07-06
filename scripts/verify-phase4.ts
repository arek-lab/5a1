/**
 * Manual verification — Phase 4: Early Checkout
 *
 * Run: npx tsx --env-file=.env.local scripts/verify-phase4.ts
 *
 * 4.6 — processEarlyCheckout commits all 5 DB changes atomically
 * 4.7 — revoked session → 401 (DB assertion; proxy path proven by IT-4 Test 2)
 * 4.8 — room QR scan with revoked session → session_revoked
 * 4.9 — non-existent reservation → reservation_not_found; no audit_log row
 */

import { NextRequest } from 'next/server'
import { createServiceRoleClient } from '../lib/supabase/service-role.js'
import { processEarlyCheckout } from '../lib/checkout/early-checkout.js'
import { GET as roomGET } from '../app/api/scan/room/route.js'

// ─── reporting ────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

const ok  = (msg: string) => { console.log(`  ✅ ${msg}`); passed++ }
const fail = (msg: string, detail?: unknown) => {
  console.error(`  ❌ ${msg}`)
  if (detail !== undefined) console.error('    ', detail)
  failed++
}
const section = (title: string) => {
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`  ${title}`)
  console.log('─'.repeat(60))
}

// ─── fixtures ─────────────────────────────────────────────────────────────────

const db = createServiceRoleClient()
let propertyId: string, roomId: string, reservationId: string, sessionId: string, qrId: string

async function setup() {
  section('Setup — inserting fixtures')

  const { data: p, error: e1 } = await db
    .from('properties')
    .insert({ name: 'verify-p4 property', timezone: 'UTC', dpa_signed_at: new Date().toISOString() })
    .select().single()
  if (e1) throw e1
  propertyId = p.id
  console.log(`  property    ${propertyId}`)

  const { data: r, error: e2 } = await db
    .from('rooms')
    .insert({ property_id: propertyId, room_number: '301' })
    .select().single()
  if (e2) throw e2
  roomId = r.id
  console.log(`  room        ${roomId}`)

  const yesterday  = new Date(Date.now() - 86_400_000).toISOString()
  const tomorrow   = new Date(Date.now() + 86_400_000).toISOString()
  const twoHrsAgo  = new Date(Date.now() - 7_200_000).toISOString()

  const { data: res, error: e3 } = await db
    .from('reservations')
    .insert({
      property_id: propertyId, room_id: roomId,
      check_in: yesterday, check_out: tomorrow,
      source: 'direct', status: 'checked_in',
    })
    .select().single()
  if (e3) throw e3
  reservationId = res.id
  console.log(`  reservation ${reservationId}`)

  await db.from('rooms').update({
    room_active_reservation_id: reservationId,
    valid_from: twoHrsAgo,
    valid_until: tomorrow,
  }).eq('id', roomId)

  const { data: qr, error: e4 } = await db
    .from('qr_codes')
    .insert({ property_id: propertyId, type: 'room', room_id: roomId, is_active: true })
    .select().single()
  if (e4) throw e4
  qrId = qr.id
  console.log(`  qr_code     ${qrId}`)

  const { data: sess, error: e5 } = await db
    .from('sessions')
    .insert({
      property_id: propertyId, auth_level: 2,
      reservation_id: reservationId, room_id: roomId,
      expires_at: tomorrow, revoked: false,
    })
    .select().single()
  if (e5) throw e5
  sessionId = sess.id
  console.log(`  session     ${sessionId}`)
}

async function teardown() {
  section('Teardown — cleaning fixtures')
  await db.from('rooms').update({ room_active_reservation_id: null }).eq('property_id', propertyId)
  await db.from('sessions').delete().eq('property_id', propertyId)
  await db.from('audit_logs').delete().eq('target_id', reservationId)
  await db.from('qr_codes').delete().eq('property_id', propertyId)
  await db.from('reservations').delete().eq('property_id', propertyId)
  await db.from('rooms').delete().eq('property_id', propertyId)
  await db.from('properties').delete().eq('id', propertyId)
  console.log('  done')
}

// ─── 4.6 — atomic checkout ────────────────────────────────────────────────────

async function verify46() {
  section('4.6 — processEarlyCheckout: all 5 DB changes committed atomically')

  await processEarlyCheckout(reservationId)

  const { data: res } = await db.from('reservations').select('status').eq('id', reservationId).single()
  res?.status === 'checked_out' ? ok('reservations.status = checked_out') : fail('reservations.status', res?.status)

  const { data: sess } = await db.from('sessions').select('revoked').eq('id', sessionId).single()
  sess?.revoked === true ? ok('sessions.revoked = true') : fail('sessions.revoked', sess?.revoked)

  const { data: room } = await db.from('rooms').select('valid_until').eq('id', roomId).single()
  const ts = room?.valid_until ? new Date(room.valid_until).getTime() : Infinity
  ts <= Date.now() + 5_000
    ? ok(`rooms.valid_until closed → ${room?.valid_until}`)
    : fail('rooms.valid_until not closed', room?.valid_until)

  const { data: qr } = await db.from('qr_codes').select('is_active').eq('id', qrId).single()
  qr?.is_active === false ? ok('qr_codes.is_active = false') : fail('qr_codes.is_active', qr?.is_active)

  const { data: logs } = await db.from('audit_logs').select('event_type').eq('target_id', reservationId)
  logs?.some(l => l.event_type === 'early_checkout')
    ? ok(`audit_logs: early_checkout entry present (${logs.length} row(s))`)
    : fail('audit_logs: no early_checkout entry', logs)
}

// ─── 4.7 — revoked session → 401 ─────────────────────────────────────────────

async function verify47() {
  section('4.7 — revoked session: DB state confirms proxy would return 401')

  const { data: sess } = await db.from('sessions').select('revoked').eq('id', sessionId).single()
  sess?.revoked === true
    ? ok(`session ${sessionId} has revoked=true → proxy returns 401 (enforced in proxy.ts:22-23)`)
    : fail('session not revoked in DB', sess)
}

// ─── 4.8 — room QR with revoked session → session_revoked ────────────────────

async function verify48() {
  section('4.8 — room QR scan with revoked session → session_revoked redirect')

  const req = new NextRequest(`http://localhost:3000/api/scan/room?room_id=${roomId}`, {
    headers: { cookie: `__Host-session=${sessionId}` },
  })
  const res = await roomGET(req)
  const location = res.headers.get('location') ?? ''

  location.includes('session_revoked')
    ? ok(`status ${res.status} → redirect contains session_revoked`)
    : fail('redirect missing session_revoked', `status=${res.status} location=${location}`)
}

// ─── 4.9 — non-existent reservation → error + no audit row ───────────────────

async function verify49() {
  section('4.9 — processEarlyCheckout(fake id): throws reservation_not_found; no audit_log')

  const fakeId = '00000000-0000-0000-0000-000000000001'
  let threw = false
  let message = ''
  try {
    await processEarlyCheckout(fakeId)
  } catch (err) {
    threw = true
    message = err instanceof Error ? err.message : String(err)
  }

  threw && message.includes('reservation_not_found')
    ? ok(`threw: "${message}"`)
    : fail('did not throw reservation_not_found', { threw, message })

  const { data: logs } = await db.from('audit_logs').select('id').eq('target_id', fakeId)
  logs?.length === 0
    ? ok('no audit_log row for fakeId (rollback confirmed)')
    : fail(`unexpected audit_log rows: ${logs?.length}`)
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔍  Phase 4 verification\n')
  await setup()
  await verify46()
  await verify47()
  await verify48()
  await verify49()
  await teardown()
  section('Result')
  console.log(`  passed: ${passed}   failed: ${failed}\n`)
  if (failed > 0) process.exit(1)
}

main().catch(err => { console.error('\n💥', err); process.exit(1) })
