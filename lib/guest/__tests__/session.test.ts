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
  property?: {
    name: string
    logo_url: string | null
    ai_bot_name?: string | null
    phone_reception?: string | null
  } | null
  reservation?: { guest_first_name: string | null; check_in?: string | null; check_out?: string | null } | null
  room?: { room_number: string } | null
}) {
  return {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => {
            if (table === 'properties') return { data: responses.property ?? null }
            if (table === 'reservations') return { data: responses.reservation ?? null }
            if (table === 'rooms') return { data: responses.room ?? null }
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

  it('returns null when the x-session-auth-level header is missing', async () => {
    mockHeaders.mockResolvedValue(
      headersWith({ 'x-property-id': 'prop-1', 'x-session-id': 'sess-1' })
    )
    mockWithTenantContext.mockResolvedValue(makeClient({}) as never)

    const result = await getGuestSessionContext()

    expect(result).toBeNull()
  })

  it('returns null when auth_level is 0', async () => {
    mockHeaders.mockResolvedValue(
      headersWith({
        'x-property-id': 'prop-1',
        'x-session-id': 'sess-1',
        'x-session-auth-level': '0',
      })
    )
    mockWithTenantContext.mockResolvedValue(makeClient({}) as never)

    const result = await getGuestSessionContext()

    expect(result).toBeNull()
  })

  it('returns the guest context for a valid auth_level>=1 session with a reservation and room', async () => {
    mockHeaders.mockResolvedValue(
      headersWith({
        'x-property-id': 'prop-1',
        'x-session-id': 'sess-1',
        'x-session-auth-level': '2',
        'x-session-reservation-id': 'res-1',
        'x-session-room-id': 'room-1',
      })
    )
    mockWithTenantContext.mockResolvedValue(
      makeClient({
        property: {
          name: 'Hotel Test',
          logo_url: 'https://example.com/logo.png',
          ai_bot_name: 'Hela',
          phone_reception: '+48123456789',
        },
        reservation: { guest_first_name: 'Jan', check_in: '2026-07-14T14:00:00Z', check_out: '2026-07-18T11:00:00Z' },
        room: { room_number: '204' },
      }) as never
    )

    const result = await getGuestSessionContext()

    expect(result).toEqual({
      propertyId: 'prop-1',
      sessionId: 'sess-1',
      authLevel: 2,
      guestFirstName: 'Jan',
      checkIn: '2026-07-14T14:00:00Z',
      checkOut: '2026-07-18T11:00:00Z',
      roomNumber: '204',
      roomId: 'room-1',
      reservationId: 'res-1',
      propertyName: 'Hotel Test',
      logoUrl: 'https://example.com/logo.png',
      aiBotName: 'Hela',
      phoneReception: '+48123456789',
    })
  })

  it('returns a null guestFirstName and roomNumber when the session has no reservation or room', async () => {
    mockHeaders.mockResolvedValue(
      headersWith({
        'x-property-id': 'prop-1',
        'x-session-id': 'sess-1',
        'x-session-auth-level': '1',
      })
    )
    mockWithTenantContext.mockResolvedValue(
      makeClient({
        property: { name: 'Hotel Test', logo_url: null },
      }) as never
    )

    const result = await getGuestSessionContext()

    expect(result?.guestFirstName).toBeNull()
    expect(result?.checkIn).toBeNull()
    expect(result?.checkOut).toBeNull()
    expect(result?.roomNumber).toBeNull()
    expect(result?.roomId).toBeNull()
    expect(result?.reservationId).toBeNull()
  })
})
