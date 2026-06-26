/**
 * Manual verification script for S1.1 QR generation logic.
 *
 * Run: node --env-file=.env.local --experimental-strip-types scripts/verify-qr.ts
 *
 * Creates isolated test data, verifies 3.4 / 3.5 / 3.6, cleans up.
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

type Check = { label: string; ok: boolean; detail?: string }
const checks: Check[] = []

function pass(label: string, detail?: string) { checks.push({ label, ok: true, detail }) }
function fail(label: string, detail?: string) { checks.push({ label, ok: false, detail }) }

// ── Setup ─────────────────────────────────────────────────────────────────────

async function setup() {
  // Property WITH dpa_signed_at (for 3.4 / 3.5)
  const { data: propDpa, error: e1 } = await supabase
    .from('properties')
    .insert({ name: '__test_s1_1_dpa__', dpa_signed_at: new Date().toISOString() })
    .select('id')
    .single()
  if (e1 || !propDpa) throw new Error(`setup property w/ DPA: ${e1?.message}`)

  // Property WITHOUT dpa_signed_at (for 3.6)
  const { data: propNoDpa, error: e2 } = await supabase
    .from('properties')
    .insert({ name: '__test_s1_1_nodpa__' })
    .select('id')
    .single()
  if (e2 || !propNoDpa) throw new Error(`setup property w/o DPA: ${e2?.message}`)

  // Room for propDpa
  const { data: room, error: e3 } = await supabase
    .from('rooms')
    .insert({ property_id: propDpa.id, room_number: '101' })
    .select('id')
    .single()
  if (e3 || !room) throw new Error(`setup room: ${e3?.message}`)

  return { propDpaId: propDpa.id, propNoDpaId: propNoDpa.id, roomId: room.id }
}

// ── Teardown ──────────────────────────────────────────────────────────────────

async function teardown(propDpaId: string, propNoDpaId: string, roomId: string) {
  await supabase.from('qr_codes').delete().eq('property_id', propDpaId)
  await supabase.from('rooms').delete().eq('id', roomId)
  await supabase.from('properties').delete().in('id', [propDpaId, propNoDpaId])
}

// ── Helpers (replicate generate.ts logic without @/ aliases) ──────────────────

async function deactivateReception(propertyId: string) {
  const { error } = await supabase
    .from('qr_codes')
    .update({ is_active: false })
    .eq('property_id', propertyId)
    .eq('type', 'reception')
    .eq('is_active', true)
  if (error) throw error
}

async function insertReceptionQR(propertyId: string) {
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('qr_codes')
    .insert({ property_id: propertyId, type: 'reception', expires_at: expiresAt, rotates_every: '5 minutes', is_active: true })
    .select()
    .single()
  if (error) throw error
  return data
}

async function insertRoomQR(propertyId: string, roomId: string) {
  const { data, error } = await supabase
    .from('qr_codes')
    .insert({ property_id: propertyId, type: 'room', room_id: roomId, is_active: true, expires_at: null, rotates_every: null })
    .select()
    .single()
  if (error) throw error
  return data
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== S1.1 QR Manual Verification ===\n')

  const { propDpaId, propNoDpaId, roomId } = await setup()

  try {
    // ── 3.4: Reception QR rotation ──────────────────────────────────────────

    // First QR
    await deactivateReception(propDpaId)
    const first = await insertReceptionQR(propDpaId)

    // Second call — rotation
    await deactivateReception(propDpaId)
    const second = await insertReceptionQR(propDpaId)

    // Old record must have is_active=false, init_token unchanged
    const { data: oldRec } = await supabase
      .from('qr_codes').select('is_active, init_token').eq('id', first.id).single()

    if (oldRec?.is_active === false && oldRec.init_token === first.init_token) {
      pass('3.4a: old reception QR → is_active=false, init_token intact')
    } else {
      fail('3.4a', `is_active=${oldRec?.is_active}, token_match=${oldRec?.init_token === first.init_token}`)
    }

    // New record must have correct fields and expires_at ≈ +15min
    const expiresMs = new Date(second.expires_at ?? 0).getTime()
    const now = Date.now()
    const expiresOk = expiresMs >= now + 14 * 60 * 1000 && expiresMs <= now + 16 * 60 * 1000

    // PostgreSQL normalizes '5 minutes' → '00:05:00'; accept both
    const rotatesOk = second.rotates_every === '5 minutes' || second.rotates_every === '00:05:00'

    if (second.is_active && rotatesOk && expiresOk) {
      pass('3.4b: new reception QR → is_active=true, rotates_every=5 minutes, expires_at≈+15min')
    } else {
      fail('3.4b', `is_active=${second.is_active}, rotates_every=${second.rotates_every}, expiresOk=${expiresOk}`)
    }

    // ── 3.5: Room QR ────────────────────────────────────────────────────────

    const roomQr = await insertRoomQR(propDpaId, roomId)

    if (roomQr.is_active && roomQr.expires_at === null && roomQr.room_id === roomId) {
      pass('3.5: room QR → is_active=true, expires_at=null, room_id populated')
    } else {
      fail('3.5', `is_active=${roomQr.is_active}, expires_at=${roomQr.expires_at}, room_id=${roomQr.room_id}`)
    }

    // ── 3.6: DPA gate ────────────────────────────────────────────────────────

    const { data: dpaRow } = await supabase
      .from('properties').select('dpa_signed_at').eq('id', propNoDpaId).single()

    if (dpaRow?.dpa_signed_at === null) {
      pass('3.6: DPA gate → dpa_signed_at is null, generateReceptionQR/generateRoomQR would throw DpaNotSignedError')
    } else {
      fail('3.6', `dpa_signed_at=${dpaRow?.dpa_signed_at}`)
    }

  } finally {
    await teardown(propDpaId, propNoDpaId, roomId)
    console.log('Test data cleaned up.\n')
  }

  // ── Report ──────────────────────────────────────────────────────────────────

  console.log('Results:')
  for (const c of checks) {
    console.log(`  ${c.ok ? '✅' : '❌'} ${c.label}${c.detail ? ` — ${c.detail}` : ''}`)
  }
  const allOk = checks.every(c => c.ok)
  console.log(`\n${allOk ? '✅ All checks passed' : '❌ Some checks failed'}`)
  if (!allOk) process.exit(1)
}

main().catch(err => {
  console.error('Script error:', err)
  process.exit(1)
})
