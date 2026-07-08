import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/headers', () => ({
  headers: vi.fn(),
}))
vi.mock('@/lib/supabase/tenant', () => ({
  withTenantContext: vi.fn(),
}))
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return { ...actual, cache: (fn: unknown) => fn }
})

import { headers } from 'next/headers'
import { withTenantContext } from '@/lib/supabase/tenant'
import { getGuestSessionContext } from '../session'

const mockHeaders = vi.mocked(headers)
const mockWithTenantContext = vi.mocked(withTenantContext)

function headersWith(values: Record<string, string>) {
  return {
    get: (key: string) => values[key] ?? null,
  } as unknown as Headers
}

function makeClient(responses: {
  session?: { id: string; property_id: string; auth_level: number; reservation_id: string | null } | null
  property?: { name: string; logo_url: string | null } | null
  reservation?: { guest_first_name: string | null } | null
}) {
  return {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => {
            if (table === 'sessions') return { data: responses.session ?? null }
            if (table === 'properties') return { data: responses.property ?? null }
            if (table === 'reservations') return { data: responses.reservation ?? null }
            return { data: null }
          }),
        })),
      })),
    })),
  }
}

describe('getGuestSessionContext', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns null when x-property-id header is absent (withTenantContext throws)', async () => {
    mockHeaders.mockResolvedValue(headersWith({}))
    mockWithTenantContext.mockRejectedValue(new Error('Missing or invalid x-property-id header'))

    const result = await getGuestSessionContext()

    expect(result).toBeNull()
  })

  it('returns null when the session row is missing', async () => {
    mockHeaders.mockResolvedValue(
      headersWith({ 'x-property-id': 'prop-1', 'x-session-id': 'sess-1' })
    )
    mockWithTenantContext.mockResolvedValue(makeClient({ session: null }) as never)

    const result = await getGuestSessionContext()

    expect(result).toBeNull()
  })

  it('returns null when auth_level is 0', async () => {
    mockHeaders.mockResolvedValue(
      headersWith({ 'x-property-id': 'prop-1', 'x-session-id': 'sess-1' })
    )
    mockWithTenantContext.mockResolvedValue(
      makeClient({
        session: { id: 'sess-1', property_id: 'prop-1', auth_level: 0, reservation_id: null },
      }) as never
    )

    const result = await getGuestSessionContext()

    expect(result).toBeNull()
  })

  it('returns the guest context for a valid auth_level>=1 session with a reservation', async () => {
    mockHeaders.mockResolvedValue(
      headersWith({ 'x-property-id': 'prop-1', 'x-session-id': 'sess-1' })
    )
    mockWithTenantContext.mockResolvedValue(
      makeClient({
        session: { id: 'sess-1', property_id: 'prop-1', auth_level: 2, reservation_id: 'res-1' },
        property: { name: 'Hotel Test', logo_url: 'https://example.com/logo.png' },
        reservation: { guest_first_name: 'Jan' },
      }) as never
    )

    const result = await getGuestSessionContext()

    expect(result).toEqual({
      propertyId: 'prop-1',
      sessionId: 'sess-1',
      authLevel: 2,
      guestFirstName: 'Jan',
      propertyName: 'Hotel Test',
      logoUrl: 'https://example.com/logo.png',
    })
  })

  it('returns a null guestFirstName when the session has no reservation', async () => {
    mockHeaders.mockResolvedValue(
      headersWith({ 'x-property-id': 'prop-1', 'x-session-id': 'sess-1' })
    )
    mockWithTenantContext.mockResolvedValue(
      makeClient({
        session: { id: 'sess-1', property_id: 'prop-1', auth_level: 1, reservation_id: null },
        property: { name: 'Hotel Test', logo_url: null },
      }) as never
    )

    const result = await getGuestSessionContext()

    expect(result?.guestFirstName).toBeNull()
  })
})
