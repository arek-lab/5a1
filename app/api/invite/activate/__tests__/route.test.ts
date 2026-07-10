import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(),
}))

const mockEq = vi.fn()
const mockUpdate = vi.fn(() => ({ eq: mockEq }))
const mockFrom = vi.fn(() => ({ update: mockUpdate }))
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({ from: mockFrom })),
}))

import { createServerClient } from '@/lib/supabase/server'
import { POST } from '../route'

const mockCreateServerClient = vi.mocked(createServerClient)

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/invite/activate', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

function mockAuthedUser(email: string | null): void {
  mockCreateServerClient.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: email ? { id: 'auth-1', email } : null } }),
    },
  } as never)
}

describe('POST /api/invite/activate', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    // eq is chainable: .eq().eq().eq() must resolve to { error: null } on the last call
    mockEq.mockReturnValue({ eq: mockEq })
  })

  it('returns 401 when unauthenticated', async () => {
    mockAuthedUser(null)

    const response = await POST(jsonRequest({ propertyId: 'prop-a' }))

    expect(response.status).toBe(401)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns 400 when propertyId is missing from the body', async () => {
    mockAuthedUser('invited@example.com')

    const response = await POST(jsonRequest({}))

    expect(response.status).toBe(400)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('scopes activation to the property from the request, not just email+status', async () => {
    mockAuthedUser('invited@example.com')
    // final .eq() call resolves the update chain
    mockEq.mockReturnValueOnce({ eq: mockEq }).mockReturnValueOnce({ eq: mockEq }).mockReturnValueOnce({
      error: null,
    })

    const response = await POST(jsonRequest({ propertyId: 'prop-a' }))

    expect(response.status).toBe(204)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ auth_user_id: 'auth-1', status: 'active' })
    )
    expect(mockEq).toHaveBeenNthCalledWith(1, 'email', 'invited@example.com')
    expect(mockEq).toHaveBeenNthCalledWith(2, 'status', 'invited')
    expect(mockEq).toHaveBeenNthCalledWith(3, 'property_id', 'prop-a')
  })
})
