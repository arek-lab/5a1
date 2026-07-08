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
const mockRpc = vi.fn()
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({ from: mockFrom, rpc: mockRpc })),
}))
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { getHotelUser } from '@/lib/panel/auth'
import { sendInviteEmail } from '@/lib/invites/send-invite'
import { inviteUser, changeRole, deactivateUser, reactivateUser, transferOwnership } from '../actions'

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

function chainWith(resolution: unknown) {
  const chain: Record<string, unknown> = {}
  chain.select = vi.fn(() => chain)
  chain.update = vi.fn(() => chain)
  chain.eq = vi.fn(() => chain)
  chain.single = vi.fn(() => Promise.resolve(resolution))
  chain.then = (resolve: (value: unknown) => void) => resolve(resolution)
  return chain
}

describe('users actions — deactivateUser', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockGetHotelUser.mockResolvedValue(makeUser({ id: 'user-1' }))
  })

  it('rejects self-deactivation', async () => {
    const result = await deactivateUser('user-1')

    expect(result).toEqual({ error: 'cannot_deactivate_self' })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('rejects staff caller with forbidden', async () => {
    mockGetHotelUser.mockResolvedValue(makeUser({ id: 'user-1', role: 'staff' }))

    const result = await deactivateUser('user-2')

    expect(result).toEqual({ error: 'forbidden' })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('rejects deactivating the only active owner', async () => {
    mockFrom
      .mockImplementationOnce(() => chainWith({ data: { role: 'owner' } }))
      .mockImplementationOnce(() => chainWith({ count: 1 }))

    const result = await deactivateUser('user-2')

    expect(result).toEqual({ error: 'last_owner_requires_transfer' })
  })

  it('deactivates an owner when a second active owner exists', async () => {
    mockFrom
      .mockImplementationOnce(() => chainWith({ data: { role: 'owner' } }))
      .mockImplementationOnce(() => chainWith({ count: 2 }))
      .mockImplementationOnce(() => chainWith({ error: null }))

    const result = await deactivateUser('user-2')

    expect(result).toEqual({})
  })

  it('deactivates a staff member without touching the owner count', async () => {
    mockFrom
      .mockImplementationOnce(() => chainWith({ data: { role: 'staff' } }))
      .mockImplementationOnce(() => chainWith({ error: null }))

    const result = await deactivateUser('user-2')

    expect(result).toEqual({})
  })

  it('returns not_found for a missing target', async () => {
    mockFrom.mockImplementationOnce(() => chainWith({ data: null }))

    const result = await deactivateUser('user-2')

    expect(result).toEqual({ error: 'not_found' })
  })
})

describe('users actions — reactivateUser', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockGetHotelUser.mockResolvedValue(makeUser({ id: 'user-1' }))
  })

  it('rejects staff caller with forbidden', async () => {
    mockGetHotelUser.mockResolvedValue(makeUser({ id: 'user-1', role: 'staff' }))

    const result = await reactivateUser('user-2')

    expect(result).toEqual({ error: 'forbidden' })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns not_found when the target is not deactivated', async () => {
    mockFrom.mockImplementationOnce(() => chainWith({ data: { status: 'active' } }))

    const result = await reactivateUser('user-2')

    expect(result).toEqual({ error: 'not_found' })
  })

  it('reactivates a deactivated user', async () => {
    mockFrom
      .mockImplementationOnce(() => chainWith({ data: { status: 'deactivated' } }))
      .mockImplementationOnce(() => chainWith({ error: null }))

    const result = await reactivateUser('user-2')

    expect(result).toEqual({})
  })
})

describe('users actions — transferOwnership', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockGetHotelUser.mockResolvedValue(makeUser({ id: 'owner-1', role: 'owner' }))
  })

  it('rejects admin caller with forbidden', async () => {
    mockGetHotelUser.mockResolvedValue(makeUser({ id: 'admin-1', role: 'admin' }))

    const result = await transferOwnership('user-2')

    expect(result).toEqual({ error: 'forbidden' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('rejects a non-active target', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'target_not_active: user-2' } })

    const result = await transferOwnership('user-2')

    expect(result).toEqual({ error: 'target_not_active' })
    expect(mockRpc).toHaveBeenCalledWith('transfer_hotel_ownership', {
      p_property_id: PROP,
      p_current_owner_id: 'owner-1',
      p_new_owner_id: 'user-2',
    })
  })

  it('transfers ownership on success', async () => {
    mockRpc.mockResolvedValue({ error: null })

    const result = await transferOwnership('user-2')

    expect(result).toEqual({})
  })
})
