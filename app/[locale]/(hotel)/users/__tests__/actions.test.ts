import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { HotelUser } from '@/lib/panel/auth'

vi.mock('@/lib/panel/auth', () => ({
  getHotelUser: vi.fn(),
}))
vi.mock('@/lib/invites/send-invite', () => ({
  sendInviteEmail: vi.fn(),
}))

const mockInsert = vi.fn()
const mockFrom = vi.fn()
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({ from: mockFrom })),
}))

import { getHotelUser } from '@/lib/panel/auth'
import { sendInviteEmail } from '@/lib/invites/send-invite'
import { inviteUser } from '../actions'

const mockGetHotelUser = vi.mocked(getHotelUser)
const mockSendInviteEmail = vi.mocked(sendInviteEmail)

const PROP = 'prop-abc'

function makeUser(overrides: Partial<HotelUser> = {}): HotelUser {
  return {
    id: 'user-1',
    propertyId: PROP,
    role: 'owner',
    fullName: 'Test User',
    email: 'owner@example.com',
    ...overrides,
  }
}

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) fd.set(key, value)
  return fd
}

describe('users actions — inviteUser', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockGetHotelUser.mockResolvedValue(makeUser())
    mockSendInviteEmail.mockResolvedValue({})
    mockFrom.mockReturnValue({ insert: mockInsert })
    mockInsert.mockResolvedValue({ error: null })
  })

  it('rejects role=owner', async () => {
    const result = await inviteUser(formData({ email: 'new@example.com', role: 'owner' }))

    expect(result).toEqual({ error: 'invalid_role' })
    expect(mockInsert).not.toHaveBeenCalled()
    expect(mockSendInviteEmail).not.toHaveBeenCalled()
  })

  it('rejects staff caller with forbidden', async () => {
    mockGetHotelUser.mockResolvedValue(makeUser({ role: 'staff' }))

    const result = await inviteUser(formData({ email: 'new@example.com', role: 'viewer' }))

    expect(result).toEqual({ error: 'forbidden' })
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('rejects viewer caller with forbidden', async () => {
    mockGetHotelUser.mockResolvedValue(makeUser({ role: 'viewer' }))

    const result = await inviteUser(formData({ email: 'new@example.com', role: 'viewer' }))

    expect(result).toEqual({ error: 'forbidden' })
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('inserts an invited row and sends the invite email for an admin caller', async () => {
    mockGetHotelUser.mockResolvedValue(makeUser({ role: 'admin' }))

    const result = await inviteUser(formData({ email: 'new@example.com', role: 'staff' }))

    expect(result).toEqual({})
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        property_id: PROP,
        email: 'new@example.com',
        role: 'staff',
        status: 'invited',
      })
    )
    expect(mockSendInviteEmail).toHaveBeenCalledWith(
      'new@example.com',
      expect.stringContaining('/invite/accept')
    )
  })

  it('returns already_invited on unique violation', async () => {
    mockInsert.mockResolvedValue({ error: { code: '23505', message: 'duplicate' } })

    const result = await inviteUser(formData({ email: 'new@example.com', role: 'staff' }))

    expect(result).toEqual({ error: 'already_invited' })
    expect(mockSendInviteEmail).not.toHaveBeenCalled()
  })
})
