import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getRedis } from '@/lib/rate-limit/client'
import { getOrComposeKb } from '../cache'

let propertyAId: string
let propertyBId: string
let faqRowId: string

function headersFor(propertyId: string): Headers {
  return new Headers({ 'x-property-id': propertyId })
}

describe('IT-9: KB compose + cache roundtrip (real Supabase + real Redis)', () => {
  beforeAll(async () => {
    const db = createServiceRoleClient()

    const { data: propA, error: propAErr } = await db
      .from('properties')
      .insert({ name: 'IT-9 Property A', timezone: 'UTC', dpa_signed_at: new Date().toISOString() })
      .select()
      .single()
    if (propAErr) throw propAErr
    propertyAId = propA.id

    const { data: propB, error: propBErr } = await db
      .from('properties')
      .insert({ name: 'IT-9 Property B', timezone: 'UTC', dpa_signed_at: new Date().toISOString() })
      .select()
      .single()
    if (propBErr) throw propBErr
    propertyBId = propB.id

    const now = new Date()
    const past = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

    const { data: faqRow, error: faqErr } = await db
      .from('knowledge_chunks')
      .insert({
        property_id: propertyAId,
        category: 'faq',
        question: 'Kiedy jest check-in?',
        content: 'Check-in od 14:00.',
        content_hash: 'faq-1-hash',
      })
      .select()
      .single()
    if (faqErr) throw faqErr
    faqRowId = faqRow.id

    const { error: faq2Err } = await db.from('knowledge_chunks').insert({
      property_id: propertyAId,
      category: 'faq',
      question: 'Czy jest parking?',
      content: 'Tak, bezpłatny parking.',
      content_hash: 'faq-2-hash',
    })
    if (faq2Err) throw faq2Err

    const { error: localErr } = await db.from('knowledge_chunks').insert({
      property_id: propertyAId,
      category: 'local',
      content: 'Najbliższa apteka jest 200m od hotelu.',
      content_hash: 'local-1-hash',
    })
    if (localErr) throw localErr

    const { error: restaurantErr } = await db.from('knowledge_chunks').insert({
      property_id: propertyAId,
      category: 'restaurant',
      content: '# Menu\nŚniadanie 7:00-10:00.',
      content_hash: 'restaurant-1-hash',
    })
    if (restaurantErr) throw restaurantErr

    const { error: policiesErr } = await db.from('knowledge_chunks').insert({
      property_id: propertyAId,
      category: 'policies',
      content: 'Zwierzęta domowe dozwolone za dodatkową opłatą.',
      content_hash: 'policies-1-hash',
    })
    if (policiesErr) throw policiesErr

    const { error: expiredErr } = await db.from('knowledge_chunks').insert({
      property_id: propertyAId,
      category: 'faq',
      question: 'Stara promocja?',
      content: 'Ta promocja już nie obowiązuje.',
      content_hash: 'faq-expired-hash',
      valid_until: past,
    })
    if (expiredErr) throw expiredErr

    const { error: serviceActiveErr } = await db.from('services').insert({
      property_id: propertyAId,
      name: 'Room service',
      description: 'Zamów jedzenie do pokoju.',
      category: 'other',
      price_cents: 2500,
      is_active: true,
    })
    if (serviceActiveErr) throw serviceActiveErr

    const { error: serviceInactiveErr } = await db.from('services').insert({
      property_id: propertyAId,
      name: 'Old service',
      description: 'Nieaktywna usługa.',
      category: 'other',
      price_cents: 1000,
      is_active: false,
    })
    if (serviceInactiveErr) throw serviceInactiveErr

    const { error: serviceOutOfWindowErr } = await db.from('services').insert({
      property_id: propertyAId,
      name: 'Late night snack',
      description: 'Tylko w nocy.',
      category: 'other',
      price_cents: 1500,
      is_active: true,
      is_time_sensitive: true,
      available_from: '02:00:00',
      available_to: '03:00:00',
    })
    if (serviceOutOfWindowErr) throw serviceOutOfWindowErr

    const { error: faqBErr } = await db.from('knowledge_chunks').insert({
      property_id: propertyBId,
      category: 'faq',
      question: 'Property B pytanie?',
      content: 'Property B unikalna treść.',
      content_hash: 'faq-b-hash',
    })
    if (faqBErr) throw faqBErr
  }, 30_000)

  afterAll(async () => {
    const db = createServiceRoleClient()
    await db.from('knowledge_chunks').delete().eq('property_id', propertyAId)
    await db.from('knowledge_chunks').delete().eq('property_id', propertyBId)
    await db.from('services').delete().eq('property_id', propertyAId)
    await db.from('properties').delete().eq('id', propertyAId)
    await db.from('properties').delete().eq('id', propertyBId)
    await getRedis().del(`kb:${propertyAId}`)
    await getRedis().del(`kb:${propertyBId}`)
  }, 30_000)

  it('composes all 5 sections in order, filters invalid rows, isolates tenants, and caches correctly', async () => {
    const first = await getOrComposeKb(headersFor(propertyAId))
    expect(first.cacheHit).toBe(false)

    const order = ['## FAQ', '## Usługi', '## Menu', '## Polityki', '## Okolica']
    const indices = order.map(heading => first.markdown.indexOf(heading))
    expect(indices.every(i => i >= 0)).toBe(true)
    expect(indices).toEqual([...indices].sort((a, b) => a - b))

    expect(first.markdown).not.toContain('Ta promocja już nie obowiązuje')
    expect(first.markdown).not.toContain('Old service')
    expect(first.markdown).not.toContain('Late night snack')
    expect(first.markdown).not.toContain('Property B')

    expect(first.markdown).toContain('Check-in od 14:00.')
    expect(first.markdown).toContain('Room service')
    expect(first.markdown).toContain('# Menu')
    expect(first.markdown).toContain('Zwierzęta domowe')
    expect(first.markdown).toContain('apteka')

    const ttlAfterFirst = await getRedis().ttl(`kb:${propertyAId}`)
    expect(ttlAfterFirst).toBeGreaterThan(0)
    expect(ttlAfterFirst).toBeLessThanOrEqual(86_400)

    const second = await getOrComposeKb(headersFor(propertyAId))
    expect(second.cacheHit).toBe(true)
    expect(second.markdown).toBe(first.markdown)
    expect(second.hash).toBe(first.hash)

    const db = createServiceRoleClient()
    const { error: updateErr } = await db
      .from('knowledge_chunks')
      .update({ content: 'Check-in od 15:00 (zaktualizowane).', content_hash: 'faq-1-hash-updated' })
      .eq('id', faqRowId)
    if (updateErr) throw updateErr

    const third = await getOrComposeKb(headersFor(propertyAId))
    expect(third.cacheHit).toBe(false)
    expect(third.hash).not.toBe(first.hash)
    expect(third.markdown).toContain('Check-in od 15:00 (zaktualizowane).')
    expect(third.markdown).not.toContain('Check-in od 14:00.')

    const ttlAfterUpdate = await getRedis().ttl(`kb:${propertyAId}`)
    expect(ttlAfterUpdate).toBeGreaterThan(0)
    expect(ttlAfterUpdate).toBeLessThanOrEqual(86_400)
  }, 30_000)
})
