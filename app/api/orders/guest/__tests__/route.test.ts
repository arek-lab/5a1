import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockWithTenantContext = vi.fn()
vi.mock('@/lib/supabase/tenant', () => ({
  withTenantContext: (...args: unknown[]) => mockWithTenantContext(...args),
}))

import { GET } from '../route'

function getRequest(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/orders/guest', {
    headers: { 'x-session-id': 'session-1', 'x-property-id': 'prop-1', ...headers },
  })
}

function makeClient(options: {
  session: { id: string; auth_level: number } | null
  orders?: Array<{ id: string; status: string; created_at: string; scheduled_at: string | null; note: string | null; services: { name: string } | null }>
}) {
  const sessionBuilder = {
    select: vi.fn(() => sessionBuilder),
    eq: vi.fn(() => sessionBuilder),
    single: vi.fn(async () => ({ data: options.session, error: null })),
  }

  const ordersBuilder = {
    select: vi.fn(() => ordersBuilder),
    eq: vi.fn(() => ordersBuilder),
    order: vi.fn(async () => ({ data: options.orders ?? [], error: null })),
  }

  const from = vi.fn((table: string) => {
    if (table === 'sessions') return sessionBuilder
    if (table === 'orders') return ordersBuilder
    throw new Error(`unexpected table: ${table}`)
  })

  return { from }
}

describe('GET /api/orders/guest', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns 401 when x-session-id header is missing', async () => {
    const response = await GET(getRequest({ 'x-session-id': '' }) as never)
    expect(response.status).toBe(401)
    expect(mockWithTenantContext).not.toHaveBeenCalled()
  })

  it('returns 401 when withTenantContext rejects', async () => {
    mockWithTenantContext.mockRejectedValue(new Error('Missing or invalid x-property-id header'))

    const response = await GET(getRequest() as never)

    expect(response.status).toBe(401)
  })

  it('returns 401 when the session does not exist or lacks auth', async () => {
    mockWithTenantContext.mockResolvedValue(makeClient({ session: null }))

    const response = await GET(getRequest() as never)

    expect(response.status).toBe(401)
  })

  it('returns the guest own orders as JSON', async () => {
    mockWithTenantContext.mockResolvedValue(
      makeClient({
        session: { id: 'session-1', auth_level: 1 },
        orders: [
          {
            id: 'order-1',
            status: 'confirmed',
            created_at: '2026-07-13T10:00:00.000Z',
            scheduled_at: null,
            note: null,
            services: { name: 'Masaż' },
          },
        ],
      })
    )

    const response = await GET(getRequest() as never)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({
      orders: [
        {
          id: 'order-1',
          status: 'confirmed',
          createdAt: '2026-07-13T10:00:00.000Z',
          scheduledAt: null,
          note: null,
          serviceName: 'Masaż',
        },
      ],
    })
  })
})
