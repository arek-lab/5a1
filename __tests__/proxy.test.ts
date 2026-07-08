import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
  })),
}))

vi.mock('next-intl/middleware', () => ({
  default: () => (request: NextRequest) => NextResponse.next({ request }),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(),
}))

vi.mock('@/lib/analytics/capture', () => ({
  captureEvent: vi.fn(),
}))

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { captureEvent } from '@/lib/analytics/capture'
import proxy from '../proxy'

const mockCreateServiceRoleClient = vi.mocked(createServiceRoleClient)
const mockCaptureEvent = vi.mocked(captureEvent)

const PROP = 'prop-abc'
const SESSION_ID = 'session-1'

function makeAdmin(session: { id: string; revoked: boolean; expires_at: string; property_id: string; last_seen_at: string } | null) {
  const updateEq = vi.fn().mockResolvedValue({ error: null })
  const update = vi.fn().mockReturnValue({ eq: updateEq })
  const single = vi.fn().mockResolvedValue({ data: session })
  const selectEq = vi.fn().mockReturnValue({ single })
  const select = vi.fn().mockReturnValue({ eq: selectEq })
  const from = vi.fn().mockReturnValue({ select, update })
  return { from, update, updateEq }
}

function makeSession(overrides: Partial<{ lastSeenAt: string }> = {}) {
  return {
    id: SESSION_ID,
    revoked: false,
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    property_id: PROP,
    last_seen_at: overrides.lastSeenAt ?? new Date().toISOString(),
  }
}

function requestWithSession(url: string) {
  return new NextRequest(url, { headers: { cookie: `__Host-session=${SESSION_ID}` } })
}

describe('proxy: guest_session_returned', () => {
  beforeEach(() => vi.resetAllMocks())

  it('fires guest_session_returned when the gap exceeds 30 minutes', async () => {
    const admin = makeAdmin(makeSession({ lastSeenAt: new Date(Date.now() - 45 * 60 * 1000).toISOString() }))
    mockCreateServiceRoleClient.mockReturnValue(admin as never)

    await proxy(requestWithSession('http://localhost/'))

    expect(mockCaptureEvent).toHaveBeenCalledWith(
      { name: 'guest_session_returned', properties: {} },
      { distinctId: SESSION_ID, propertyId: PROP }
    )
    expect(admin.update).toHaveBeenCalledWith(
      expect.objectContaining({ last_seen_at: expect.any(String) })
    )
  })

  it('does not fire guest_session_returned for a recent visit', async () => {
    const admin = makeAdmin(makeSession({ lastSeenAt: new Date(Date.now() - 5 * 60 * 1000).toISOString() }))
    mockCreateServiceRoleClient.mockReturnValue(admin as never)

    await proxy(requestWithSession('http://localhost/'))

    expect(mockCaptureEvent).not.toHaveBeenCalled()
    expect(admin.update).toHaveBeenCalled()
  })

  it('does not fire or update last_seen_at for /api/ routes', async () => {
    const admin = makeAdmin(makeSession({ lastSeenAt: new Date(Date.now() - 45 * 60 * 1000).toISOString() }))
    mockCreateServiceRoleClient.mockReturnValue(admin as never)

    await proxy(requestWithSession('http://localhost/api/some-route'))

    expect(mockCaptureEvent).not.toHaveBeenCalled()
    expect(admin.update).not.toHaveBeenCalled()
  })
})
