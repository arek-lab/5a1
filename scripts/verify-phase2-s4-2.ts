/**
 * Manual verification — s4-2 Phase 2: /api/concierge/stream
 *
 * Run: npx tsx --env-file=.env.local scripts/verify-phase2-s4-2.ts
 *
 * 2.4 — incrementally arriving `data:` chunks, not one blocked response
 * 2.5 — time-to-first-chunk is comfortably under 1.5s
 */

import { NextRequest } from 'next/server'
import { createServiceRoleClient } from '../lib/supabase/service-role.js'
import { POST as conciergeStreamPOST } from '../app/api/concierge/stream/route.js'

const db = createServiceRoleClient()
let propertyId: string, sessionId: string

async function setup() {
  const { data: p, error: e1 } = await db
    .from('properties')
    .insert({ name: 'verify-s4-2 property', timezone: 'UTC', dpa_signed_at: new Date().toISOString() })
    .select().single()
  if (e1) throw e1
  propertyId = p.id

  const { data: sess, error: e2 } = await db
    .from('sessions')
    .insert({
      property_id: propertyId,
      auth_level: 1,
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      revoked: false,
    })
    .select().single()
  if (e2) throw e2
  sessionId = sess.id

  console.log(`  property ${propertyId}`)
  console.log(`  session  ${sessionId}`)
}

async function teardown() {
  await db.from('sessions').delete().eq('property_id', propertyId)
  await db.from('properties').delete().eq('id', propertyId)
}

async function run() {
  const req = new NextRequest('http://localhost:3000/api/concierge/stream', {
    method: 'POST',
    headers: {
      'x-session-id': sessionId,
      'x-property-id': propertyId,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ question: 'What time is breakfast served?', history: [] }),
  })

  const startedAt = Date.now()
  const response = await conciergeStreamPOST(req)

  console.log(`\n  status: ${response.status}`)
  console.log(`  content-type: ${response.headers.get('Content-Type')}\n`)

  if (!response.body) {
    console.error('  ❌ no response body (expected a readable SSE stream)')
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let firstChunkAt: number | null = null
  let frameCount = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const text = decoder.decode(value, { stream: true })
    if (firstChunkAt === null) {
      firstChunkAt = Date.now()
      console.log(`  ⏱  time-to-first-chunk: ${firstChunkAt - startedAt}ms`)
    }
    frameCount++
    process.stdout.write(text)
  }

  console.log(`\n\n  ${frameCount} SSE frame(s) received, total time: ${Date.now() - startedAt}ms`)
}

async function main() {
  console.log('\n🔍  s4-2 Phase 2 manual verification\n')
  await setup()
  try {
    await run()
  } finally {
    await teardown()
  }
}

main().catch((err) => {
  console.error('\n💥', err)
  process.exit(1)
})
