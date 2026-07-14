import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT')
  }),
}))
vi.mock('../session', () => ({
  getGuestSessionContext: vi.fn(),
}))

import { redirect } from 'next/navigation'
import { getGuestSessionContext } from '../session'
import { requireGuestSession } from '../require-session'

const mockRedirect = vi.mocked(redirect)
const mockGetGuestSessionContext = vi.mocked(getGuestSessionContext)

describe('requireGuestSession', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockRedirect.mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })
  })

  it('returns the context when present', async () => {
    const context = {
      propertyId: 'prop-1',
      sessionId: 'sess-1',
      authLevel: 1,
      guestFirstName: null,
      checkIn: null,
      checkOut: null,
      roomNumber: null,
      roomId: null,
      reservationId: null,
      propertyName: 'Hotel Test',
      logoUrl: null,
      aiBotName: null,
      phoneReception: null,
    }
    mockGetGuestSessionContext.mockResolvedValue(context)

    const result = await requireGuestSession()

    expect(result).toEqual(context)
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('redirects to /error?type=insufficient_auth when context is null', async () => {
    mockGetGuestSessionContext.mockResolvedValue(null)

    await expect(requireGuestSession()).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/error?type=insufficient_auth')
  })
})
