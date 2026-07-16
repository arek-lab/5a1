import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { generateReceptionQR, generateRoomQR, DpaNotSignedError } from '@/lib/qr/generate'

let propertyId: string
let roomId: string

describe('IT-6: QR generation DPA gate (real Supabase)', () => {
  beforeAll(async () => {
    const db = createServiceRoleClient()

    const { data: property, error: propErr } = await db
      .from('properties')
      .insert({ name: 'IT-6 Test Property', timezone: 'UTC', dpa_signed_at: null })
      .select()
      .single()
    if (propErr) throw propErr
    propertyId = property.id

    const { data: room, error: roomErr } = await db
      .from('rooms')
      .insert({ property_id: propertyId, room_number: '601' })
      .select()
      .single()
    if (roomErr) throw roomErr
    roomId = room.id
  }, 30_000)

  afterAll(async () => {
    const db = createServiceRoleClient()
    await db.from('qr_codes').delete().eq('property_id', propertyId)
    await db.from('rooms').delete().eq('property_id', propertyId)
    await db.from('properties').delete().eq('id', propertyId)
  }, 30_000)

  it('Test 1 — reception QR blocked when DPA not signed', async () => {
    await expect(generateReceptionQR(propertyId)).rejects.toThrow(DpaNotSignedError)
  }, 15_000)

  it('Test 2 — reception QR succeeds after DPA is signed', async () => {
    const db = createServiceRoleClient()
    const { error } = await db
      .from('properties')
      .update({ dpa_signed_at: new Date().toISOString() })
      .eq('id', propertyId)
    if (error) throw error

    const qr = await generateReceptionQR(propertyId)
    expect(qr.is_active).toBe(true)
    expect(qr.type).toBe('reception')
    expect(qr.property_id).toBe(propertyId)
  }, 15_000)

  it('Test 3 — room QR succeeds once DPA is signed', async () => {
    const qr = await generateRoomQR(propertyId, roomId)
    expect(qr.is_active).toBe(true)
    expect(qr.type).toBe('room')
    expect(qr.room_id).toBe(roomId)
  }, 15_000)

  it('Test 4 — concurrent reception QR rotations leave exactly one active row', async () => {
    const results = await Promise.allSettled([
      generateReceptionQR(propertyId),
      generateReceptionQR(propertyId),
      generateReceptionQR(propertyId),
    ])

    for (const result of results) {
      expect(result.status).toBe('fulfilled')
    }

    const db = createServiceRoleClient()
    const { data: activeRows, error } = await db
      .from('qr_codes')
      .select('id')
      .eq('property_id', propertyId)
      .eq('type', 'reception')
      .eq('is_active', true)
    if (error) throw error

    expect(activeRows).toHaveLength(1)
  }, 15_000)
})
