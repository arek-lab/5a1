import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { NextRequest } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { GET as guestStreamGET } from '@/app/api/orders/stream/guest/route'

let propertyId: string
let serviceId: string
let sessionAId: string
let sessionBId: string
let orderAId: string

// ReadableStream fulfills read() requests in FIFO order. If we started a
// fresh reader.read() on every retry and let a timed-out one dangle, an
// enqueue arriving after the timeout would resolve that abandoned promise
// instead of the retry loop's current one — every attempt would then see
// only a stale, already-discarded read. A single in-flight read() reused
// across attempts (only replaced once it actually resolves) avoids this.
function nextEventReader(reader: ReadableStreamDefaultReader<Uint8Array>) {
  let pending = reader.read()

  return async function readNextEvent(timeoutMs: number): Promise<string | null> {
    const current = pending
    const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), timeoutMs))
    const result = await Promise.race([current, timeout])

    if (result === 'timeout') return null

    pending = reader.read()
    return result.done || !result.value ? null : new TextDecoder().decode(result.value)
  }
}

// subscribeToOrderChanges() kicks off the singleton's connect()+LISTEN
// asynchronously — Postgres does not queue NOTIFYs for listeners that
// subscribe after the fact, so a NOTIFY fired before LISTEN lands is lost
// for good. Retrying the (idempotent) UPDATE self-heals against that race
// instead of guessing a fixed settle delay.
async function updateUntilDelivered(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  triggerUpdate: () => Promise<void>,
  maxAttempts: number
): Promise<string | null> {
  const readNextEvent = nextEventReader(reader)
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await triggerUpdate()
    const chunk = await readNextEvent(1_500)
    if (chunk) return chunk
  }
  return null
}

function streamRequest(sessionId: string, propId: string): NextRequest {
  return new NextRequest('http://localhost/api/orders/stream/guest', {
    headers: { 'x-session-id': sessionId, 'x-property-id': propId },
  })
}

describe('IT: guest orders SSE session isolation (real Supabase)', () => {
  beforeAll(async () => {
    const db = createServiceRoleClient()

    const { data: prop, error: propErr } = await db
      .from('properties')
      .insert({ name: 'IT-guest-sse Property', timezone: 'UTC', dpa_signed_at: new Date().toISOString() })
      .select()
      .single()
    if (propErr) throw propErr
    propertyId = prop.id

    const { data: service, error: serviceErr } = await db
      .from('services')
      .insert({ property_id: propertyId, name: 'IT-guest-sse Service', category: 'other' })
      .select()
      .single()
    if (serviceErr) throw serviceErr
    serviceId = service.id

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()

    const { data: sessionA, error: sessionAErr } = await db
      .from('sessions')
      .insert({ property_id: propertyId, auth_level: 1, expires_at: expiresAt })
      .select()
      .single()
    if (sessionAErr) throw sessionAErr
    sessionAId = sessionA.id

    const { data: sessionB, error: sessionBErr } = await db
      .from('sessions')
      .insert({ property_id: propertyId, auth_level: 1, expires_at: expiresAt })
      .select()
      .single()
    if (sessionBErr) throw sessionBErr
    sessionBId = sessionB.id

    const { data: orderA, error: orderAErr } = await db
      .from('orders')
      .insert({ property_id: propertyId, service_id: serviceId, session_id: sessionAId, status: 'new' })
      .select()
      .single()
    if (orderAErr) throw orderAErr
    orderAId = orderA.id
  }, 30_000)

  afterAll(async () => {
    const db = createServiceRoleClient()
    await db.from('orders').delete().eq('property_id', propertyId)
    await db.from('services').delete().eq('property_id', propertyId)
    await db.from('sessions').delete().eq('property_id', propertyId)
    await db.from('properties').delete().eq('id', propertyId)
  }, 30_000)

  it('delivers a status update to the subscribing session and not to another session of the same property', async () => {
    const responseA = await guestStreamGET(streamRequest(sessionAId, propertyId))
    expect(responseA.status).toBe(200)
    const readerA = responseA.body!.getReader()

    const responseB = await guestStreamGET(streamRequest(sessionBId, propertyId))
    expect(responseB.status).toBe(200)
    const readerB = responseB.body!.getReader()

    try {
      const db = createServiceRoleClient()
      const triggerUpdate = async () => {
        const { error } = await db.from('orders').update({ status: 'confirmed' }).eq('id', orderAId)
        if (error) throw error
      }

      const chunkA = await updateUntilDelivered(readerA, triggerUpdate, 8)
      expect(chunkA).not.toBeNull()
      expect(chunkA).toContain(orderAId)
      expect(chunkA).toContain('"status":"confirmed"')

      const chunkB = await nextEventReader(readerB)(2_000)
      expect(chunkB).toBeNull()
    } finally {
      await readerA.cancel()
      await readerB.cancel()
    }
  }, 30_000)

  it('rejects a request missing session headers with 401', async () => {
    const response = await guestStreamGET(new NextRequest('http://localhost/api/orders/stream/guest'))
    expect(response.status).toBe(401)
  })
})
