import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { HotelUser } from '@/lib/panel/auth'

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))
vi.mock('@/lib/panel/auth', () => ({
  getHotelUser: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(),
}))
vi.mock('@/lib/analytics/capture', () => ({
  captureEvent: vi.fn(),
}))

import { getHotelUser } from '@/lib/panel/auth'
import { createServerClient } from '@/lib/supabase/server'
import { captureEvent } from '@/lib/analytics/capture'
import { saveHotelProfile } from '../actions'

const mockGetHotelUser = vi.mocked(getHotelUser)
const mockCreateServerClient = vi.mocked(createServerClient)
const mockCaptureEvent = vi.mocked(captureEvent)

const PROP = 'prop-abc'

function makeUser(overrides: Partial<HotelUser> = {}): HotelUser {
  return {
    id: 'user-1',
    propertyId: PROP,
    role: 'owner',
    fullName: 'Test User',
    email: 'test@example.com',
    ...overrides,
  }
}

function makeClient(updateError: Error | null = null) {
  return {
    from: vi.fn().mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: updateError }),
      }),
    }),
  }
}

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) fd.set(key, value)
  return fd
}

describe('saveHotelProfile', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns forbidden without calling captureEvent when caller lacks write access', async () => {
    mockGetHotelUser.mockResolvedValue(makeUser({ role: 'viewer' }))

    const result = await saveHotelProfile(formData({ name: 'Hotel' }))

    expect(result).toEqual({ error: 'forbidden' })
    expect(mockCaptureEvent).not.toHaveBeenCalled()
  })

  it('fires hotel_settings_updated with area profile on success', async () => {
    mockGetHotelUser.mockResolvedValue(makeUser())
    mockCreateServerClient.mockResolvedValue(makeClient() as never)

    const result = await saveHotelProfile(formData({ name: 'Hotel' }))

    expect(result).toEqual({})
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      { name: 'hotel_settings_updated', properties: { area: 'profile' } },
      { distinctId: 'user-1', propertyId: PROP }
    )
  })
})
