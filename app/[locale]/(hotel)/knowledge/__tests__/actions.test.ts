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
  createKnowledgeEntry,
  updateKnowledgeEntry,
  deleteKnowledgeEntry,
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
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
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

const validFaqFields = {
  question: 'What time is check-in?',
  content: 'Check-in is from 15:00.',
  category: 'faq',
  language: 'pl',
  valid_from: '',
  valid_until: '',
}

const expectedEvent = {
  name: 'hotel_settings_updated' as const,
  properties: { area: 'knowledge' as const },
}
const expectedCtx = { distinctId: 'user-1', propertyId: PROP }

describe('knowledge actions — hotel_settings_updated instrumentation', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockGetHotelUser.mockResolvedValue(makeUser())
    mockCreateServerClient.mockResolvedValue(makeClient() as never)
  })

  it('createKnowledgeEntry fires event on success', async () => {
    const result = await createKnowledgeEntry(formData(validFaqFields))

    expect(result).toEqual({})
    expect(mockCaptureEvent).toHaveBeenCalledWith(expectedEvent, expectedCtx)
  })

  it('updateKnowledgeEntry fires event on success', async () => {
    const result = await updateKnowledgeEntry(formData({ id: 'kb-1', ...validFaqFields }))

    expect(result).toEqual({})
    expect(mockCaptureEvent).toHaveBeenCalledWith(expectedEvent, expectedCtx)
  })

  it('deleteKnowledgeEntry fires event on success', async () => {
    const result = await deleteKnowledgeEntry('kb-1')

    expect(result).toEqual({})
    expect(mockCaptureEvent).toHaveBeenCalledWith(expectedEvent, expectedCtx)
  })

  it('does not fire the event when the caller is forbidden', async () => {
    mockGetHotelUser.mockResolvedValue(makeUser({ role: 'viewer' }))

    const result = await createKnowledgeEntry(formData(validFaqFields))

    expect(result).toEqual({ error: 'forbidden' })
    expect(mockCaptureEvent).not.toHaveBeenCalled()
  })
})
