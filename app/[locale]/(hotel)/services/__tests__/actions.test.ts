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
import {
  createCustomService,
  updateService,
  toggleServiceActive,
  toggleServicePin,
} from '../actions'

const mockGetHotelUser = vi.mocked(getHotelUser)
const mockCreateServerClient = vi.mocked(createServerClient)
const mockCaptureEvent = vi.mocked(captureEvent)

const PROP = 'prop-abc'

function makeUser(overrides: Partial<HotelUser> = {}): HotelUser {
  return {
    id: 'user-1',
    propertyId: PROP,
    role: 'staff',
    fullName: 'Test User',
    email: 'test@example.com',
    ...overrides,
  }
}

function makeClient() {
  return {
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            neq: vi.fn().mockResolvedValue({ count: 0, error: null }),
          }),
        }),
      }),
    }),
  }
}

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) fd.set(key, value)
  return fd
}

const validServiceFields = {
  name: 'Room Service',
  category: 'room_service',
  price_cents: '1000',
  image_url: '',
}

const expectedEvent = {
  name: 'hotel_settings_updated' as const,
  properties: { area: 'services' as const },
}
const expectedCtx = { distinctId: 'user-1', propertyId: PROP }

describe('services actions — hotel_settings_updated instrumentation', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockGetHotelUser.mockResolvedValue(makeUser())
    mockCreateServerClient.mockResolvedValue(makeClient() as never)
  })

  it('createCustomService fires event on success', async () => {
    const result = await createCustomService(formData(validServiceFields))

    expect(result).toEqual({})
    expect(mockCaptureEvent).toHaveBeenCalledWith(expectedEvent, expectedCtx)
  })

  it('updateService fires event on success', async () => {
    const result = await updateService(formData({ id: 'svc-1', ...validServiceFields }))

    expect(result).toEqual({})
    expect(mockCaptureEvent).toHaveBeenCalledWith(expectedEvent, expectedCtx)
  })

  it('toggleServiceActive fires event on success', async () => {
    const result = await toggleServiceActive('svc-1', false)

    expect(result).toEqual({})
    expect(mockCaptureEvent).toHaveBeenCalledWith(expectedEvent, expectedCtx)
  })

  it('toggleServicePin fires event on success', async () => {
    const result = await toggleServicePin('svc-1', true)

    expect(result).toEqual({})
    expect(mockCaptureEvent).toHaveBeenCalledWith(expectedEvent, expectedCtx)
  })

  it('does not fire the event when the caller is forbidden', async () => {
    mockGetHotelUser.mockResolvedValue(makeUser({ role: 'viewer' }))

    const result = await createCustomService(formData(validServiceFields))

    expect(result).toEqual({ error: 'forbidden' })
    expect(mockCaptureEvent).not.toHaveBeenCalled()
  })
})
