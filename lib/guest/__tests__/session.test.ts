import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/headers', () => ({
  headers: vi.fn(),
  cookies: vi.fn(),
}))
vi.mock('@/lib/supabase/tenant', () => ({
  withTenantContext: vi.fn(),
}))
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(),
}))
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return { ...actual, cache: (fn: unknown) => fn }
})
vi.mock('@sentry/nextjs', () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
  flush: vi.fn().mockResolvedValue(true),
}))

import { headers, cookies } from 'next/headers'
import * as Sentry from '@sentry/nextjs'
import { withTenantContext } from '@/lib/supabase/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getGuestSessionContext } from '../session'

const mockHeaders = vi.mocked(headers)
const mockCookies = vi.mocked(cookies)
const mockWithTenantContext = vi.mocked(withTenantContext)
const mockCreateServiceRoleClient = vi.mocked(createServiceRoleClient)
const mockCaptureMessage = vi.mocked(Sentry.captureMessage)

function headersWith(values: Record<string, string>) {
  return {
    get: (key: string) => values[key] ?? null,
  } as unknown as Headers
}

function noCookie() {
  return { get: () => undefined } as unknown as Awaited<ReturnType<typeof cookies>>
}

function cookieWith(sessionId: string) {
  return { get: () => ({ value: sessionId }) } as unknown as Awaited<ReturnType<typeof cookies>>
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

  it('returns null with no session headers and no session cookie', async () => {
    mockHeaders.mockResolvedValue(headersWith({}))
    mockCookies.mockResolvedValue(noCookie())

    const result = await getGuestSessionContext()

    expect(result).toBeNull()
    expect(mockWithTenantContext).not.toHaveBeenCalled()
  })

  it('returns null when x-property-id header is present but withTenantContext rejects it', async () => {
    mockHeaders.mockResolvedValue(
      headersWith({
        'x-property-id': 'prop-1',
        'x-session-id': 'sess-1',
        'x-session-auth-level': '1',
      })
    )
    mockWithTenantContext.mockRejectedValue(new Error('Missing or invalid x-property-id header'))

    const result = await getGuestSessionContext()

    expect(result).toBeNull()
  })

  it('returns null when headers are missing and the cookie session row is not found', async () => {
    mockHeaders.mockResolvedValue(headersWith({}))
    mockCookies.mockResolvedValue(cookieWith('sess-1'))
    mockCreateServiceRoleClient.mockReturnValue({
      from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) }),
    } as never)

    const result = await getGuestSessionContext()

    expect(result).toBeNull()
  })

  it('falls back to a direct session read when the auth-level header is momentarily missing', async () => {
    mockHeaders.mockResolvedValue(headersWith({}))
    mockCookies.mockResolvedValue(cookieWith('sess-1'))
    mockCreateServiceRoleClient.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                id: 'sess-1',
                property_id: 'prop-1',
                auth_level: 2,
                reservation_id: 'res-1',
                room_id: 'room-1',
              },
            }),
          }),
        }),
      }),
    } as never)
    mockWithTenantContext.mockResolvedValue(
      makeClient({
        property: { name: 'Hotel Test', logo_url: null },
        reservation: { guest_first_name: 'Jan' },
        room: { room_number: '204' },
      }) as never
    )

    const result = await getGuestSessionContext()

    expect(result?.sessionId).toBe('sess-1')
    expect(result?.propertyId).toBe('prop-1')
    expect(result?.authLevel).toBe(2)
    expect(result?.roomNumber).toBe('204')
  })

  it('returns null when the fallback session read has auth_level 0', async () => {
    mockHeaders.mockResolvedValue(headersWith({}))
    mockCookies.mockResolvedValue(cookieWith('sess-1'))
    mockCreateServiceRoleClient.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { id: 'sess-1', property_id: 'prop-1', auth_level: 0, reservation_id: null, room_id: null },
            }),
          }),
        }),
      }),
    } as never)

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

  it('retries the properties fetch once on a transient error and still returns context', async () => {
    mockHeaders.mockResolvedValue(
      headersWith({
        'x-property-id': 'prop-1',
        'x-session-id': 'sess-1',
        'x-session-auth-level': '1',
      })
    )
    let propertiesCallCount = 0
    mockWithTenantContext.mockResolvedValue({
      from: vi.fn((table: string) => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => {
              if (table === 'properties') {
                propertiesCallCount += 1
                if (propertiesCallCount === 1) {
                  return { data: null, error: { message: 'connection reset' } }
                }
                return { data: { name: 'Hotel Test', logo_url: null }, error: null }
              }
              return { data: null }
            }),
          })),
        })),
      })),
    } as never)

    const result = await getGuestSessionContext()

    expect(propertiesCallCount).toBe(2)
    expect(result?.propertyName).toBe('Hotel Test')
    expect(mockCaptureMessage).not.toHaveBeenCalled()
  })

  it('returns null and reports to Sentry when the properties fetch errors twice', async () => {
    mockHeaders.mockResolvedValue(
      headersWith({
        'x-property-id': 'prop-1',
        'x-session-id': 'sess-1',
        'x-session-auth-level': '1',
      })
    )
    mockWithTenantContext.mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({ data: null, error: { message: 'connection reset' } })),
          })),
        })),
      })),
    } as never)

    const result = await getGuestSessionContext()

    expect(result).toBeNull()
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      'guest_session_null: properties fetch returned no row after retry',
      expect.objectContaining({ level: 'warning' })
    )
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
