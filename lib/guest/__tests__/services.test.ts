import { describe, it, expect, vi } from 'vitest'
import {
  getPinnedServices,
  getVisibleCategories,
  getServicesByCategory,
  getServiceById,
} from '../services'

function makeClient(responses: {
  data?: unknown[] | null
  error?: { message: string } | null
}) {
  const result = { data: responses.data ?? null, error: responses.error ?? null }
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(async () => result),
    then: (resolve: (value: typeof result) => unknown) => resolve(result),
  }
  return {
    from: vi.fn(() => builder),
  }
}

function makeSingleClient(responses: {
  data?: unknown | null
  error?: { message: string } | null
}) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data: responses.data ?? null, error: responses.error ?? null })),
  }
  return {
    from: vi.fn(() => builder),
  }
}

describe('getPinnedServices', () => {
  it('maps rows to PinnedService shape using PL name for pl locale', async () => {
    const client = makeClient({
      data: [
        { id: 's1', name: 'Masaż', name_en: 'Massage', category: 'spa', price_cents: 5000, image_url: null },
        { id: 's2', name: 'Śniadanie', name_en: null, category: 'restaurant', price_cents: null, image_url: 'https://x/y.png' },
      ],
    })

    const result = await getPinnedServices(client as never, 'prop-1', 'pl')

    expect(result).toEqual([
      { id: 's1', name: 'Masaż', category: 'spa', priceCents: 5000, imageUrl: null },
      { id: 's2', name: 'Śniadanie', category: 'restaurant', priceCents: null, imageUrl: 'https://x/y.png' },
    ])
  })

  it('uses EN name for en locale when present, PL fallback otherwise', async () => {
    const client = makeClient({
      data: [
        { id: 's1', name: 'Masaż', name_en: 'Massage', category: 'spa', price_cents: 5000, image_url: null },
        { id: 's2', name: 'Śniadanie', name_en: null, category: 'restaurant', price_cents: null, image_url: null },
      ],
    })

    const result = await getPinnedServices(client as never, 'prop-1', 'en')

    expect(result.map(s => s.name)).toEqual(['Massage', 'Śniadanie'])
  })

  it('returns an empty array when no pinned services exist', async () => {
    const client = makeClient({ data: [] })

    const result = await getPinnedServices(client as never, 'prop-1', 'pl')

    expect(result).toEqual([])
  })

  it('throws when the query errors', async () => {
    const client = makeClient({ data: null, error: { message: 'boom' } })

    await expect(getPinnedServices(client as never, 'prop-1', 'pl')).rejects.toThrow('boom')
  })
})

describe('getVisibleCategories', () => {
  it('returns only categories with at least one active service, in SERVICE_CATEGORIES order', async () => {
    const client = makeClient({
      data: [{ category: 'spa' }, { category: 'restaurant' }, { category: 'spa' }],
    })

    const result = await getVisibleCategories(client as never, 'prop-1')

    expect(result).toEqual(['restaurant', 'spa'])
  })

  it('returns an empty array for a property with no active services', async () => {
    const client = makeClient({ data: [] })

    const result = await getVisibleCategories(client as never, 'prop-1')

    expect(result).toEqual([])
  })

  it('throws when the query errors', async () => {
    const client = makeClient({ data: null, error: { message: 'boom' } })

    await expect(getVisibleCategories(client as never, 'prop-1')).rejects.toThrow('boom')
  })
})

describe('getServicesByCategory', () => {
  it('maps rows to ServiceListItem shape, active first, PL for pl locale', async () => {
    const client = makeClient({
      data: [
        { id: 's1', name: 'Masaż', name_en: 'Massage', price_cents: 5000, image_url: null, is_active: true },
        { id: 's2', name: 'Stary masaż', name_en: null, price_cents: null, image_url: null, is_active: false },
      ],
    })

    const result = await getServicesByCategory(client as never, 'prop-1', 'spa', 'pl')

    expect(result).toEqual([
      { id: 's1', name: 'Masaż', priceCents: 5000, imageUrl: null, isActive: true },
      { id: 's2', name: 'Stary masaż', priceCents: null, imageUrl: null, isActive: false },
    ])
  })

  it('uses EN name for en locale when present, PL fallback otherwise', async () => {
    const client = makeClient({
      data: [
        { id: 's1', name: 'Masaż', name_en: 'Massage', price_cents: 5000, image_url: null, is_active: true },
        { id: 's2', name: 'Stary masaż', name_en: '', price_cents: null, image_url: null, is_active: false },
      ],
    })

    const result = await getServicesByCategory(client as never, 'prop-1', 'spa', 'en')

    expect(result.map(s => s.name)).toEqual(['Massage', 'Stary masaż'])
  })

  it('returns an empty array when the category has no services', async () => {
    const client = makeClient({ data: [] })

    const result = await getServicesByCategory(client as never, 'prop-1', 'spa', 'pl')

    expect(result).toEqual([])
  })

  it('throws when the query errors', async () => {
    const client = makeClient({ data: null, error: { message: 'boom' } })

    await expect(getServicesByCategory(client as never, 'prop-1', 'spa', 'pl')).rejects.toThrow('boom')
  })
})

describe('getServiceById', () => {
  it('maps the row to ServiceDetail shape using PL for pl locale', async () => {
    const client = makeSingleClient({
      data: {
        id: 's1',
        name: 'Masaż',
        name_en: 'Massage',
        description: 'Relaksujący',
        description_en: 'Relaxing',
        category: 'spa',
        price_cents: 5000,
        image_url: null,
        is_active: true,
        is_time_sensitive: true,
        available_from: '09:00:00',
        available_to: '17:00:00',
      },
    })

    const result = await getServiceById(client as never, 'prop-1', 's1', 'pl')

    expect(result).toEqual({
      id: 's1',
      name: 'Masaż',
      description: 'Relaksujący',
      category: 'spa',
      priceCents: 5000,
      imageUrl: null,
      isActive: true,
      isTimeSensitive: true,
      availableFrom: '09:00:00',
      availableTo: '17:00:00',
    })
  })

  it('uses EN name/description for en locale when present', async () => {
    const client = makeSingleClient({
      data: {
        id: 's1',
        name: 'Masaż',
        name_en: 'Massage',
        description: 'Relaksujący',
        description_en: 'Relaxing',
        category: 'spa',
        price_cents: 5000,
        image_url: null,
        is_active: true,
        is_time_sensitive: true,
        available_from: '09:00:00',
        available_to: '17:00:00',
      },
    })

    const result = await getServiceById(client as never, 'prop-1', 's1', 'en')

    expect(result?.name).toBe('Massage')
    expect(result?.description).toBe('Relaxing')
  })

  it('falls back to PL description when EN description is null', async () => {
    const client = makeSingleClient({
      data: {
        id: 's1',
        name: 'Masaż',
        name_en: null,
        description: 'Relaksujący',
        description_en: null,
        category: 'spa',
        price_cents: 5000,
        image_url: null,
        is_active: true,
        is_time_sensitive: true,
        available_from: '09:00:00',
        available_to: '17:00:00',
      },
    })

    const result = await getServiceById(client as never, 'prop-1', 's1', 'en')

    expect(result?.name).toBe('Masaż')
    expect(result?.description).toBe('Relaksujący')
  })

  it('returns null when the service does not exist or belongs to another property', async () => {
    const client = makeSingleClient({ data: null })

    const result = await getServiceById(client as never, 'prop-1', 'missing', 'pl')

    expect(result).toBeNull()
  })

  it('throws when the query errors', async () => {
    const client = makeSingleClient({ data: null, error: { message: 'boom' } })

    await expect(getServiceById(client as never, 'prop-1', 's1', 'pl')).rejects.toThrow('boom')
  })
})
