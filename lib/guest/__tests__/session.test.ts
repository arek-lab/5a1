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
// Passthrough: the cached function runs directly, so tests exercise the real fetch logic
// while still letting assertions inspect keyParts/options passed to unstable_cache.
vi.mock('next/cache', () => ({
  unstable_cache: vi.fn(
    (fn: (...args: never[]) => unknown) =>
      (...args: never[]) =>
        fn(...args)
  ),
}))
vi.mock('@sentry/nextjs', () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
  flush: vi.fn().mockResolvedValue(true),
}))

import { headers, cookies } from 'next/headers'
import { unstable_cache } from 'next/cache'
import * as Sentry from '@sentry/nextjs'
import { withTenantContext } from '@/lib/supabase/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getGuestSessionContext } from '../session'

const mockHeaders = vi.mocked(headers)
const mockCookies = vi.mocked(cookies)
const mockUnstableCache = vi.mocked(unstable_cache)
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

// All tables now resolve through createServiceRoleClient: `sessions` for the header-less
// cookie fallback, the rest inside the unstable_cache-wrapped fetchers.
function makeServiceClient(responses: {
  session?: {
    id: string
    property_id: string
    auth_level: number
    reservation_id: string | null
    room_id: string | null
  } | null
  property?: {
    name: string
    logo_url: string | null
    ai_bot_name?: string | null
    phone_reception?: string | null
  } | null
  reservation?: {
    guest_first_name: string | null
    check_in?: string | null
    check_out?: string | null
  } | null
  room?: { room_number: string } | null
}) {
  const eqCalls: Array<{ table: string; column: string; value: unknown }> = []
  const client = {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn((column: string, value: unknown) => {
          eqCalls.push({ table, column, value })
          return {
            single: vi.fn(async () => {
              if (table === 'sessions') return { data: responses.session ?? null }
              if (table === 'properties') return { data: responses.property ?? null }
              if (table === 'reservations') return { data: responses.reservation ?? null }
              if (table === 'rooms') return { data: responses.room ?? null }
              return { data: null }
            }),
          }
        }),
      })),
    })),
  }
  return { client, eqCalls }
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
    mockCreateServiceRoleClient.mockReturnValue(makeServiceClient({ session: null }).client as never)

    const result = await getGuestSessionContext()

    expect(result).toBeNull()
  })

  it('falls back to a direct session read when the auth-level header is momentarily missing', async () => {
    mockHeaders.mockResolvedValue(headersWith({}))
    mockCookies.mockResolvedValue(cookieWith('sess-1'))
    mockCreateServiceRoleClient.mockReturnValue(
      makeServiceClient({
        session: {
          id: 'sess-1',
          property_id: 'prop-1',
          auth_level: 2,
          reservation_id: 'res-1',
          room_id: 'room-1',
        },
        property: { name: 'Hotel Test', logo_url: null },
        reservation: { guest_first_name: 'Jan' },
        room: { room_number: '204' },
      }).client as never
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
    mockCreateServiceRoleClient.mockReturnValue(
      makeServiceClient({
        session: { id: 'sess-1', property_id: 'prop-1', auth_level: 0, reservation_id: null, room_id: null },
      }).client as never
    )

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
    mockCreateServiceRoleClient.mockReturnValue(makeServiceClient({}).client as never)

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
    mockCreateServiceRoleClient.mockReturnValue(
      makeServiceClient({
        property: {
          name: 'Hotel Test',
          logo_url: 'https://example.com/logo.png',
          ai_bot_name: 'Hela',
          phone_reception: '+48123456789',
        },
        reservation: {
          guest_first_name: 'Jan',
          check_in: '2026-07-14T14:00:00Z',
          check_out: '2026-07-18T11:00:00Z',
        },
        room: { room_number: '204' },
      }).client as never
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

  it('passes ids to the cached fetchers as arguments, keyed per entity', async () => {
    mockHeaders.mockResolvedValue(
      headersWith({
        'x-property-id': 'prop-1',
        'x-session-id': 'sess-1',
        'x-session-auth-level': '2',
        'x-session-reservation-id': 'res-1',
        'x-session-room-id': 'room-1',
      })
    )
    const { client, eqCalls } = makeServiceClient({
      property: { name: 'Hotel Test', logo_url: null },
      reservation: { guest_first_name: 'Jan' },
      room: { room_number: '204' },
    })
    mockCreateServiceRoleClient.mockReturnValue(client as never)

    await getGuestSessionContext()

    // Ids flow into the cached function as arguments (part of the unstable_cache key), never
    // via a closure over headers()/cookies() — the query filters prove the argument arrived.
    expect(eqCalls).toEqual(
      expect.arrayContaining([
        { table: 'properties', column: 'id', value: 'prop-1' },
        { table: 'reservations', column: 'id', value: 'res-1' },
        { table: 'rooms', column: 'id', value: 'room-1' },
      ])
    )
    expect(mockUnstableCache).toHaveBeenCalledWith(
      expect.any(Function),
      ['guest-property'],
      expect.objectContaining({ revalidate: 300, tags: ['guest-property-prop-1'] })
    )
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
    mockCreateServiceRoleClient.mockReturnValue({
      from: vi.fn((table: string) => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => {
              if (table === 'properties') {
                propertiesCallCount += 1
                if (propertiesCallCount === 1) {
                  return { data: null, error: { message: 'connection reset' } }
                }
                return {
                  data: {
                    name: 'Hotel Test',
                    logo_url: null,
                    ai_bot_name: null,
                    phone_reception: null,
                  },
                  error: null,
                }
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
    mockCreateServiceRoleClient.mockReturnValue({
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
    mockCreateServiceRoleClient.mockReturnValue(
      makeServiceClient({
        property: { name: 'Hotel Test', logo_url: null },
      }).client as never
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
