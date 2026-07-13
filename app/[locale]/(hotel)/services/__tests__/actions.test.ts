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
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(),
}))

import { getHotelUser } from '@/lib/panel/auth'
import { createServerClient } from '@/lib/supabase/server'
import { captureEvent } from '@/lib/analytics/capture'
import { getTranslations } from 'next-intl/server'
import {
  createServiceFromTemplate,
  createCustomService,
  updateService,
  toggleServiceActive,
  toggleServicePin,
} from '../actions'

const mockGetHotelUser = vi.mocked(getHotelUser)
const mockCreateServerClient = vi.mocked(createServerClient)
const mockCaptureEvent = vi.mocked(captureEvent)
const mockGetTranslations = vi.mocked(getTranslations)

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

describe('createServiceFromTemplate — server-resolved bilingual fill', () => {
  const PL_MESSAGES: Record<string, string> = {
    'serviceTemplates.massage.name': 'Masaż',
    'serviceTemplates.massage.description': 'Relaksujący masaż w spa',
  }
  const EN_MESSAGES: Record<string, string> = {
    'serviceTemplates.massage.name': 'Massage',
    'serviceTemplates.massage.description': 'Relaxing spa massage',
  }

  beforeEach(() => {
    vi.resetAllMocks()
    mockGetHotelUser.mockResolvedValue(makeUser())
    mockGetTranslations.mockImplementation(async (opts) => {
      const locale = typeof opts === 'object' && opts && 'locale' in opts ? opts.locale : undefined
      const messages = locale === 'en' ? EN_MESSAGES : PL_MESSAGES
      return ((key: string) => messages[key] ?? key) as never
    })
  })

  it('fills name/name_en/description/description_en from the two resolved locales', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null })
    mockCreateServerClient.mockResolvedValue({ from: vi.fn().mockReturnValue({ insert }) } as never)

    const result = await createServiceFromTemplate(formData({ template_key: 'massage' }))

    expect(result).toEqual({})
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Masaż',
        name_en: 'Massage',
        description: 'Relaksujący masaż w spa',
        description_en: 'Relaxing spa massage',
      })
    )
  })

  it('produces the same insert payload regardless of which locale the panel is set to', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null })
    mockCreateServerClient.mockResolvedValue({ from: vi.fn().mockReturnValue({ insert }) } as never)

    await createServiceFromTemplate(formData({ template_key: 'massage' }))

    expect(mockGetTranslations).toHaveBeenCalledWith({ locale: 'pl' })
    expect(mockGetTranslations).toHaveBeenCalledWith({ locale: 'en' })
  })
})

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
