import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { HotelUser } from '@/lib/panel/auth'

vi.mock('@/lib/panel/auth', () => ({
  getHotelUser: vi.fn(),
}))
vi.mock('@/lib/analytics/capture', () => ({
  captureEvent: vi.fn(),
}))

import { getHotelUser } from '@/lib/panel/auth'
import { captureEvent } from '@/lib/analytics/capture'
import { POST } from '../route'

const mockGetHotelUser = vi.mocked(getHotelUser)
const mockCaptureEvent = vi.mocked(captureEvent)

function makeUser(overrides: Partial<HotelUser> = {}): HotelUser {
  return {
    id: 'user-1',
    propertyId: 'prop-abc',
    role: 'owner',
    fullName: 'Test User',
    email: 'test@example.com',
    ...overrides,
  }
}

describe('POST /api/panel/auth/login-event', () => {
  beforeEach(() => vi.resetAllMocks())

  it('fires hotel_login and returns 204 for an authenticated hotel user', async () => {
    mockGetHotelUser.mockResolvedValue(makeUser())
    mockCaptureEvent.mockResolvedValue(undefined)

    const response = await POST()

    expect(response.status).toBe(204)
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      { name: 'hotel_login', properties: {} },
      { distinctId: 'user-1', propertyId: 'prop-abc' }
    )
  })

  it('returns 401 and does not fire the event when unauthenticated', async () => {
    mockGetHotelUser.mockResolvedValue(null)

    const response = await POST()

    expect(response.status).toBe(401)
    expect(mockCaptureEvent).not.toHaveBeenCalled()
  })
})
