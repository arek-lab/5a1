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

  it('maps email_exists to already_registered', async () => {
    mockInviteUserByEmail.mockResolvedValue({
      error: { message: 'A user with this email address has already been registered', code: 'email_exists' },
    })

    const result = await sendInviteEmail('new@example.com', 'https://app.example.com/invite/accept')

    expect(result).toEqual({ error: 'already_registered' })
  })

  it('maps other Supabase errors to a generic send_failed code', async () => {
    mockInviteUserByEmail.mockResolvedValue({ error: { message: 'boom', code: 'unexpected_failure' } })

    const result = await sendInviteEmail('new@example.com', 'https://app.example.com/invite/accept')

    expect(result).toEqual({ error: 'send_failed' })
  })
})
