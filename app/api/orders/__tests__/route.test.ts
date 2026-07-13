import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockWithTenantContext = vi.fn()
vi.mock('@/lib/supabase/tenant', () => ({
  withTenantContext: (...args: unknown[]) => mockWithTenantContext(...args),
}))

import { POST } from '../route'

function jsonRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/orders', {
    method: 'POST',
    headers: { 'x-session-id': 'session-1', 'x-property-id': 'prop-1', ...headers },
    body: JSON.stringify(body),
  })
}

type Session = {
  id: string
  auth_level: number
  property_id: string
  room_id: string | null
  reservation_id: string | null
}

function makeClient(options: {
  session: Session | null
  service?: { id: string; price_cents: number | null; is_active: boolean } | null
  property?: { timezone: string } | null
  insertError?: { message: string } | null
  orderId?: string
}) {
  const sessionBuilder = {
    select: vi.fn(() => sessionBuilder),
    eq: vi.fn(() => sessionBuilder),
    single: vi.fn(async () => ({ data: options.session, error: null })),
  }

  const serviceBuilder = {
    select: vi.fn(() => serviceBuilder),
    eq: vi.fn(() => serviceBuilder),
    maybeSingle: vi.fn(async () => ({ data: options.service ?? null, error: null })),
  }

  const propertyBuilder = {
    select: vi.fn(() => propertyBuilder),
    eq: vi.fn(() => propertyBuilder),
    single: vi.fn(async () => ({ data: options.property ?? null, error: null })),
  }

  const insertSelectSingle = vi.fn(async () => ({
    data: options.insertError ? null : { id: options.orderId ?? 'order-1' },
    error: options.insertError ?? null,
  }))
  const insertSelect = vi.fn(() => ({ single: insertSelectSingle }))
  const insertFn = vi.fn(() => ({ select: insertSelect }))
  const ordersBuilder = { insert: insertFn }

  const from = vi.fn((table: string) => {
    if (table === 'sessions') return sessionBuilder
    if (table === 'services') return serviceBuilder
    if (table === 'properties') return propertyBuilder
    if (table === 'orders') return ordersBuilder
    throw new Error(`unexpected table: ${table}`)
  })

  return { from, insertFn }
}

describe('POST /api/orders', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns 401 when x-session-id header is missing', async () => {
    const response = await POST(jsonRequest({ serviceId: 'service-1' }, { 'x-session-id': '' }) as never)
    expect(response.status).toBe(401)
    expect(mockWithTenantContext).not.toHaveBeenCalled()
  })

  it('returns 400 when the property header is invalid', async () => {
    mockWithTenantContext.mockRejectedValue(new Error('Missing or invalid x-property-id header'))

    const response = await POST(jsonRequest({ serviceId: 'service-1' }) as never)

    expect(response.status).toBe(400)
  })

  it('returns 401 when the session does not exist or lacks auth', async () => {
    mockWithTenantContext.mockResolvedValue(makeClient({ session: null }))

    const response = await POST(jsonRequest({ serviceId: '11111111-1111-1111-1111-111111111111' }) as never)

    expect(response.status).toBe(401)
  })

  it('returns 400 when serviceId is not a valid UUID', async () => {
    mockWithTenantContext.mockResolvedValue(
      makeClient({
        session: { id: 'session-1', auth_level: 1, property_id: 'prop-1', room_id: null, reservation_id: null },
      })
    )

    const response = await POST(jsonRequest({ serviceId: 'not-a-uuid' }) as never)

    expect(response.status).toBe(400)
  })

  it('returns 400 when note exceeds 500 characters', async () => {
    mockWithTenantContext.mockResolvedValue(
      makeClient({
        session: { id: 'session-1', auth_level: 1, property_id: 'prop-1', room_id: null, reservation_id: null },
      })
    )

    const response = await POST(
      jsonRequest({ serviceId: '11111111-1111-1111-1111-111111111111', note: 'x'.repeat(501) }) as never
    )

    expect(response.status).toBe(400)
  })

  it('returns 404 when the service is inactive or does not belong to the property', async () => {
    mockWithTenantContext.mockResolvedValue(
      makeClient({
        session: { id: 'session-1', auth_level: 1, property_id: 'prop-1', room_id: null, reservation_id: null },
        service: null,
      })
    )

    const response = await POST(jsonRequest({ serviceId: '11111111-1111-1111-1111-111111111111' }) as never)

    expect(response.status).toBe(404)
  })

  it('inserts the order using room_id/reservation_id from the session, not the body, and returns 201', async () => {
    const client = makeClient({
      session: {
        id: 'session-1',
        auth_level: 1,
        property_id: 'prop-1',
        room_id: 'room-1',
        reservation_id: 'reservation-1',
      },
      service: { id: '11111111-1111-1111-1111-111111111111', price_cents: 5000, is_active: true },
      orderId: 'order-42',
    })
    mockWithTenantContext.mockResolvedValue(client)

    const response = await POST(
      jsonRequest({
        serviceId: '11111111-1111-1111-1111-111111111111',
        note: 'no sugar',
        roomId: 'attacker-room',
        reservationId: 'attacker-reservation',
      }) as never
    )

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body).toEqual({ orderId: 'order-42' })
    expect(client.insertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        property_id: 'prop-1',
        session_id: 'session-1',
        room_id: 'room-1',
        reservation_id: 'reservation-1',
        service_id: '11111111-1111-1111-1111-111111111111',
        price_cents: 5000,
        note: 'no sugar',
        scheduled_at: null,
      })
    )
  })

  it('returns 500 when the insert fails', async () => {
    mockWithTenantContext.mockResolvedValue(
      makeClient({
        session: { id: 'session-1', auth_level: 1, property_id: 'prop-1', room_id: null, reservation_id: null },
        service: { id: '11111111-1111-1111-1111-111111111111', price_cents: null, is_active: true },
        insertError: { message: 'boom' },
      })
    )

    const response = await POST(jsonRequest({ serviceId: '11111111-1111-1111-1111-111111111111' }) as never)

    expect(response.status).toBe(500)
  })
})
