import { describe, it, expect, vi } from 'vitest'
import { getPinnedServices } from '../services'

function makeClient(responses: {
  data?: unknown[] | null
  error?: { message: string } | null
}) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(async () => ({ data: responses.data ?? null, error: responses.error ?? null })),
  }
  return {
    from: vi.fn(() => builder),
  }
}

describe('getPinnedServices', () => {
  it('maps rows to PinnedService shape', async () => {
    const client = makeClient({
      data: [
        { id: 's1', name: 'Massage', category: 'spa', price_cents: 5000, image_url: null },
        { id: 's2', name: 'Breakfast', category: 'restaurant', price_cents: null, image_url: 'https://x/y.png' },
      ],
    })

    const result = await getPinnedServices(client as never, 'prop-1')

    expect(result).toEqual([
      { id: 's1', name: 'Massage', category: 'spa', priceCents: 5000, imageUrl: null },
      { id: 's2', name: 'Breakfast', category: 'restaurant', priceCents: null, imageUrl: 'https://x/y.png' },
    ])
  })

  it('returns an empty array when no pinned services exist', async () => {
    const client = makeClient({ data: [] })

    const result = await getPinnedServices(client as never, 'prop-1')

    expect(result).toEqual([])
  })

  it('throws when the query errors', async () => {
    const client = makeClient({ data: null, error: { message: 'boom' } })

    await expect(getPinnedServices(client as never, 'prop-1')).rejects.toThrow('boom')
  })
})
