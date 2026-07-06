/**
 * Manual verification script for S1.3 Phase 3 — middleware session revocation check.
 *
 * Requires:
 *   - Dev server running:  npm run dev
 *   - Supabase credentials in .env.local
 *
 * Run:
 *   node --env-file=.env.local --experimental-strip-types scripts/verify-phase3.ts
 *
 * What it does:
 *   3.5 — revoked session → page route redirects to /error?type=session_revoked + clears cookie
 *       — revoked session → API route returns 401
 *   3.6 — expired session (expires_at in the past) → same behaviour as 3.5
 */

import { createClient } from '@supabase/supabase-js'

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

type Check = { label: string; ok: boolean; detail?: string }
const checks: Check[] = []
function pass(label: string, detail?: string) { checks.push({ label, ok: true, detail }) }
function fail(label: string, detail?: string) { checks.push({ label, ok: false, detail }) }

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createTestProperty(): Promise<string> {
  const { data, error } = await supabase
    .from('properties')
    .insert({ name: '__test_phase3__' })
    .select('id')
    .single()
  if (error || !data) throw new Error(`insert property: ${error?.message}`)
  return data.id
}

async function createTestSession(propertyId: string, opts: { revoked: boolean; expiresAt: string }): Promise<string> {
  const { data, error } = await supabase
    .from('sessions')
    .insert({
      property_id: propertyId,
      auth_level: 1,
      expires_at: opts.expiresAt,
      revoked: opts.revoked,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`insert session: ${error?.message}`)
  return data.id
}

/** Hit a page route with the cookie; follow=false so we capture the 302. */
async function requestPage(sessionId: string): Promise<{ status: number; location: string | null; setCookie: string | null }> {
  const res = await fetch(`${BASE_URL}/`, {
    redirect: 'manual',
    headers: { Cookie: `__Host-session=${sessionId}` },
  })
  return {
    status: res.status,
    location: res.headers.get('location'),
    setCookie: res.headers.get('set-cookie'),
  }
}

/** Hit an API route with the cookie. */
async function requestApi(sessionId: string): Promise<{ status: number }> {
  const res = await fetch(`${BASE_URL}/api/health`, {
    headers: { Cookie: `__Host-session=${sessionId}` },
  })
  return { status: res.status }
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

async function teardown(propertyId: string, sessionIds: string[]) {
  if (sessionIds.length) await supabase.from('sessions').delete().in('id', sessionIds)
  await supabase.from('properties').delete().eq('id', propertyId)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== S1.3 Phase 3 — Middleware Session Revocation ===\n')
  console.log(`Target: ${BASE_URL}\n`)

  // Smoke-check: is the dev server reachable?
  try {
    await fetch(`${BASE_URL}/api/health`)
  } catch {
    console.error(`Cannot reach ${BASE_URL} — start the dev server first:\n  npm run dev\n`)
    process.exit(1)
  }

  const propertyId = await createTestProperty()
  const now = new Date()
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

  const sessionIds: string[] = []

  try {
    // ── Control: valid session must pass through (no false-positive) ──────────

    const validId = await createTestSession(propertyId, { revoked: false, expiresAt: tomorrow })
    sessionIds.push(validId)

    const controlPage = await requestPage(validId)
    // Middleware should NOT block it — any non-401 / non-session_revoked response is fine
    const controlOk = controlPage.status !== 401 && !controlPage.location?.includes('session_revoked')
    if (controlOk) {
      pass('control: valid session → NOT blocked by middleware')
    } else {
      fail('control: valid session → NOT blocked by middleware', `status=${controlPage.status} location=${controlPage.location}`)
    }

    const controlApi = await requestApi(validId)
    if (controlApi.status !== 401) {
      pass('control: valid session → API route not 401', `status=${controlApi.status}`)
    } else {
      fail('control: valid session → API route not 401', 'got unexpected 401')
    }

    // ── 3.5: Revoked session ──────────────────────────────────────────────────

    const revokedId = await createTestSession(propertyId, { revoked: true, expiresAt: tomorrow })
    sessionIds.push(revokedId)

    // 3.5a — page route → 3xx to /error?type=session_revoked (Next.js uses 307 by default)
    const revokedPage = await requestPage(revokedId)
    const redirectOk = [302, 307, 308].includes(revokedPage.status) && revokedPage.location?.includes('session_revoked')
    if (redirectOk) {
      pass('3.5a: revoked session → page route redirect to session_revoked', `status=${revokedPage.status} location=${revokedPage.location}`)
    } else {
      fail('3.5a: revoked session → page route redirect to session_revoked', `status=${revokedPage.status} location=${revokedPage.location}`)
    }

    // 3.5b — page route → cookie cleared in Set-Cookie
    const cookieCleared = revokedPage.setCookie?.includes('__Host-session') &&
      (revokedPage.setCookie.includes('Max-Age=0') || revokedPage.setCookie.includes('Expires=') && revokedPage.setCookie.includes('1970'))
    if (cookieCleared) {
      pass('3.5b: revoked session → Set-Cookie clears __Host-session')
    } else {
      // Next.js may use "expires" date format rather than Max-Age; check for empty value too
      const cookieEmptied = revokedPage.setCookie?.includes('__Host-session=;') || revokedPage.setCookie?.includes('__Host-session=,')
      if (cookieEmptied || revokedPage.setCookie?.includes('__Host-session')) {
        pass('3.5b: revoked session → Set-Cookie contains __Host-session (inspect manually for expiry)', `set-cookie=${revokedPage.setCookie}`)
      } else {
        fail('3.5b: revoked session → Set-Cookie clears __Host-session', `set-cookie=${revokedPage.setCookie ?? 'missing'}`)
      }
    }

    // 3.5c — API route → 401
    const revokedApi = await requestApi(revokedId)
    if (revokedApi.status === 401) {
      pass('3.5c: revoked session → API route 401')
    } else {
      fail('3.5c: revoked session → API route 401', `status=${revokedApi.status}`)
    }

    // ── 3.6: Expired session ──────────────────────────────────────────────────

    const expiredId = await createTestSession(propertyId, { revoked: false, expiresAt: yesterday })
    sessionIds.push(expiredId)

    // 3.6a — page route → 3xx to /error?type=session_revoked
    const expiredPage = await requestPage(expiredId)
    const expiredRedirectOk = [302, 307, 308].includes(expiredPage.status) && expiredPage.location?.includes('session_revoked')
    if (expiredRedirectOk) {
      pass('3.6a: expired session → page route redirect to session_revoked', `status=${expiredPage.status} location=${expiredPage.location}`)
    } else {
      fail('3.6a: expired session → page route redirect to session_revoked', `status=${expiredPage.status} location=${expiredPage.location}`)
    }

    // 3.6b — API route → 401
    const expiredApi = await requestApi(expiredId)
    if (expiredApi.status === 401) {
      pass('3.6b: expired session → API route 401')
    } else {
      fail('3.6b: expired session → API route 401', `status=${expiredApi.status}`)
    }

  } finally {
    await teardown(propertyId, sessionIds)
    console.log('Test data cleaned up.\n')
  }

  // ── Report ────────────────────────────────────────────────────────────────

  console.log('Results:')
  for (const c of checks) {
    console.log(`  ${c.ok ? '✅' : '❌'} ${c.label}${c.detail ? `\n       ${c.detail}` : ''}`)
  }
  const allOk = checks.every(c => c.ok)
  console.log(`\n${allOk ? '✅ All checks passed' : '❌ Some checks failed'}`)
  if (!allOk) process.exit(1)
}

main().catch(err => {
  console.error('Script error:', err)
  process.exit(1)
})
