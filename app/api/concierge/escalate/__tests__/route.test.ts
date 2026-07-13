import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockWithTenantContext = vi.fn()
vi.mock('@/lib/supabase/tenant', () => ({
  withTenantContext: (...args: unknown[]) => mockWithTenantContext(...args),
}))

const mockCaptureEvent = vi.fn()
vi.mock('@/lib/analytics/capture', () => ({
  captureEvent: (...args: unknown[]) => mockCaptureEvent(...args),
}))

import { POST } from '../route'

function req(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/concierge/escalate', {
    method: 'POST',
    headers: { 'x-session-id': 'session-1', 'x-property-id': 'prop-1', ...headers },
  })
}

type Session = { id: string; auth_level: number; property_id: string }

function makeClient(session: Session | null) {
  const sessionBuilder = {
    select: vi.fn(() => sessionBuilder),
    eq: vi.fn(() => sessionBuilder),
    single: vi.fn(async () => ({ data: session, error: null })),
  }
  return { from: vi.fn(() => sessionBuilder) }
}

describe('POST /api/concierge/escalate', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns 401 when x-session-id header is missing, without calling captureEvent', async () => {
    const response = await POST(req({ 'x-session-id': '' }) as never)

    expect(response.status).toBe(401)
    expect(mockWithTenantContext).not.toHaveBeenCalled()
    expect(mockCaptureEvent).not.toHaveBeenCalled()
  })

  it('returns 400 when the property header is invalid', async () => {
    mockWithTenantContext.mockRejectedValue(new Error('Missing or invalid x-property-id header'))

    const response = await POST(req() as never)

    expect(response.status).toBe(400)
    expect(mockCaptureEvent).not.toHaveBeenCalled()
  })

  it('returns 401 when the session does not exist or auth_level < 1, without calling captureEvent', async () => {
    mockWithTenantContext.mockResolvedValue(makeClient(null))

    const response = await POST(req() as never)

    expect(response.status).toBe(401)
    expect(mockCaptureEvent).not.toHaveBeenCalled()
  })

  it('logs concierge_response_escalated with reason streak for a valid session', async () => {
    mockWithTenantContext.mockResolvedValue(
      makeClient({ id: 'session-1', auth_level: 1, property_id: 'prop-1' })
    )

    const response = await POST(req() as never)

    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      { name: 'concierge_response_escalated', properties: { reason: 'streak' } },
      { distinctId: 'session-1', propertyId: 'prop-1' }
    )
  })
})
