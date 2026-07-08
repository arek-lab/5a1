import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockInviteUserByEmail = vi.fn()
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    auth: { admin: { inviteUserByEmail: mockInviteUserByEmail } },
  })),
}))

import { sendInviteEmail } from '../send-invite'

describe('sendInviteEmail', () => {
  beforeEach(() => vi.resetAllMocks())

  it('calls inviteUserByEmail with the given email and redirectTo', async () => {
    mockInviteUserByEmail.mockResolvedValue({ error: null })

    const result = await sendInviteEmail('new@example.com', 'https://app.example.com/invite/accept')

    expect(result).toEqual({})
    expect(mockInviteUserByEmail).toHaveBeenCalledWith('new@example.com', {
      redirectTo: 'https://app.example.com/invite/accept',
    })
  })

  it('returns the Supabase error message on failure', async () => {
    mockInviteUserByEmail.mockResolvedValue({ error: { message: 'boom' } })

    const result = await sendInviteEmail('new@example.com', 'https://app.example.com/invite/accept')

    expect(result).toEqual({ error: 'boom' })
  })
})
