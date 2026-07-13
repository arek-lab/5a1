import { describe, it, expect, vi } from 'vitest'
import { getGuestOrders } from '../orders'

function makeClient(responses: {
  data?: unknown[] | null
  error?: { message: string } | null
}) {
  const result = { data: responses.data ?? null, error: responses.error ?? null }
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(async () => result),
  }
  return {
    from: vi.fn(() => builder),
  }
}

describe('getGuestOrders', () => {
  it('maps rows to GuestOrder shape, embedding service name', async () => {
    const client = makeClient({
      data: [
        {
          id: 'o1',
          status: 'confirmed',
          created_at: '2026-07-13T10:00:00Z',
          scheduled_at: null,
          note: 'extra towels',
          services: { name: 'Room Service' },
        },
      ],
    })

    const result = await getGuestOrders(client as never, 'sess-1')

    expect(result).toEqual([
      {
        id: 'o1',
        status: 'confirmed',
        createdAt: '2026-07-13T10:00:00Z',
        scheduledAt: null,
        note: 'extra towels',
        serviceName: 'Room Service',
      },
    ])
  })

  it('returns an empty array when the guest has no orders', async () => {
    const client = makeClient({ data: [] })

    const result = await getGuestOrders(client as never, 'sess-1')

    expect(result).toEqual([])
  })

  it('throws when the query errors', async () => {
    const client = makeClient({ data: null, error: { message: 'boom' } })

    await expect(getGuestOrders(client as never, 'sess-1')).rejects.toThrow('boom')
  })
})
