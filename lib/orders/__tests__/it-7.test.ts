import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { NextRequest } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { HotelUser } from '@/lib/panel/auth'

vi.mock('@/lib/panel/auth', () => ({
  getHotelUser: vi.fn(),
}))

// Real trigger→NOTIFY→listener→fan-out→SSE roundtrip needs a real Supabase
// connection (SUPABASE_DB_URL) — getHotelUser is mocked because auth itself
// is covered elsewhere; this test's scope is the notify pipeline + tenant
// isolation of the fan-out, per the plan's Phase 2 contract.
import { getHotelUser } from '@/lib/panel/auth'
import { GET as streamGET } from '@/app/api/orders/stream/route'

const mockedGetHotelUser = vi.mocked(getHotelUser)

let propertyAId: string
let propertyBId: string
let serviceAId: string
let serviceBId: string
let orderAId: string

function hotelUser(propertyId: string): HotelUser {
  return {
    id: `user-${propertyId}`,
    propertyId,
    role: 'staff',
    fullName: 'Test User',
    email: 'test@example.com',
  }
}

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

    // This read() settled — queue the next one before returning.
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

describe('IT-7: orders SSE roundtrip (real Supabase)', () => {
  beforeAll(async () => {
    const db = createServiceRoleClient()

    const { data: propA, error: propAErr } = await db
      .from('properties')
      .insert({ name: 'IT-7 Property A', timezone: 'UTC', dpa_signed_at: new Date().toISOString() })
      .select()
      .single()
    if (propAErr) throw propAErr
    propertyAId = propA.id

    const { data: propB, error: propBErr } = await db
      .from('properties')
      .insert({ name: 'IT-7 Property B', timezone: 'UTC', dpa_signed_at: new Date().toISOString() })
      .select()
      .single()
    if (propBErr) throw propBErr
    propertyBId = propB.id

    const { data: serviceA, error: serviceAErr } = await db
      .from('services')
      .insert({ property_id: propertyAId, name: 'IT-7 Service A', category: 'other' })
      .select()
      .single()
    if (serviceAErr) throw serviceAErr
    serviceAId = serviceA.id

    const { data: serviceB, error: serviceBErr } = await db
      .from('services')
      .insert({ property_id: propertyBId, name: 'IT-7 Service B', category: 'other' })
      .select()
      .single()
    if (serviceBErr) throw serviceBErr
    serviceBId = serviceB.id

    const { data: orderA, error: orderAErr } = await db
      .from('orders')
      .insert({ property_id: propertyAId, service_id: serviceAId, status: 'new' })
      .select()
      .single()
    if (orderAErr) throw orderAErr
    orderAId = orderA.id

    const { error: orderBErr } = await db
      .from('orders')
      .insert({ property_id: propertyBId, service_id: serviceBId, status: 'new' })
    if (orderBErr) throw orderBErr
  }, 30_000)

  afterAll(async () => {
    const db = createServiceRoleClient()
    await db.from('orders').delete().eq('property_id', propertyAId)
    await db.from('orders').delete().eq('property_id', propertyBId)
    await db.from('services').delete().eq('property_id', propertyAId)
    await db.from('services').delete().eq('property_id', propertyBId)
    await db.from('properties').delete().eq('id', propertyAId)
    await db.from('properties').delete().eq('id', propertyBId)
  }, 30_000)

  it('delivers a status update to the subscribing property and not to another', async () => {
    mockedGetHotelUser.mockResolvedValueOnce(hotelUser(propertyAId))
    const responseA = await streamGET(new NextRequest('http://localhost/api/orders/stream'))
    expect(responseA.status).toBe(200)
    const readerA = responseA.body!.getReader()

    mockedGetHotelUser.mockResolvedValueOnce(hotelUser(propertyBId))
    const responseB = await streamGET(new NextRequest('http://localhost/api/orders/stream'))
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
})
