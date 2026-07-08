import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { HotelUser } from '@/lib/panel/auth'
import type { HotelRole } from '@/lib/panel/rbac'

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
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { getHotelUser } from '@/lib/panel/auth'
import { sendInviteEmail } from '@/lib/invites/send-invite'
import { inviteUser, changeRole } from '../actions'

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

function makeChain({ singleResult, updateResult }: { singleResult: unknown; updateResult: unknown }) {
  const chain: Record<string, unknown> = {}
  chain.select = vi.fn(() => chain)
  chain.update = vi.fn(() => chain)
  chain.eq = vi.fn(() => chain)
  chain.single = vi.fn(() => Promise.resolve(singleResult))
  chain.then = (resolve: (value: unknown) => void) => resolve(updateResult)
  return chain
}

describe('users actions — changeRole', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockGetHotelUser.mockResolvedValue(makeUser())
  })

  it('rejects newRole=owner with use_transfer_ownership', async () => {
    const result = await changeRole('user-2', 'owner' as unknown as HotelRole)

    expect(result).toEqual({ error: 'use_transfer_ownership' })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('rejects changing the role of a user who is currently owner', async () => {
    mockFrom.mockReturnValue(
      makeChain({ singleResult: { data: { role: 'owner' } }, updateResult: { error: null } })
    )

    const result = await changeRole('user-2', 'admin')

    expect(result).toEqual({ error: 'use_transfer_ownership' })
  })

  it('rejects staff caller with forbidden', async () => {
    mockGetHotelUser.mockResolvedValue(makeUser({ role: 'staff' }))

    const result = await changeRole('user-2', 'admin')

    expect(result).toEqual({ error: 'forbidden' })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('updates the role for a non-owner target', async () => {
    mockFrom.mockReturnValue(
      makeChain({ singleResult: { data: { role: 'staff' } }, updateResult: { error: null } })
    )

    const result = await changeRole('user-2', 'admin')

    expect(result).toEqual({})
  })
})
