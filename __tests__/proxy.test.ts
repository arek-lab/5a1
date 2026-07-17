import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      getClaims: vi.fn().mockResolvedValue({ data: null }),
    },
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
import proxy, { config } from '../proxy'

const mockCreateServiceRoleClient = vi.mocked(createServiceRoleClient)
const mockCaptureEvent = vi.mocked(captureEvent)

describe('proxy: matcher', () => {
  // Regression test for the 2026-07-16 HMR-websocket bug: a matcher that excludes
  // only `_next/static`/`_next/image` still routes `_next/webpack-hmr` through the
  // Supabase/next-intl logic below, and a constructed NextResponse can't fulfill a
  // 101 upgrade -> silent HMR desync (phantom hydration mismatches, double PostHog
  // init). Every `_next/*` path must stay excluded.
  const matcher = new RegExp(`^${config.matcher[0]}$`)

  it('excludes all _next/* internal paths, including webpack-hmr', () => {
    expect(matcher.test('/_next/webpack-hmr')).toBe(false)
    expect(matcher.test('/_next/static/chunks/main.js')).toBe(false)
    expect(matcher.test('/_next/image')).toBe(false)
  })

  it('excludes favicon and static image extensions', () => {
    expect(matcher.test('/favicon.ico')).toBe(false)
    expect(matcher.test('/icons/icon.svg')).toBe(false)
    expect(matcher.test('/photo.png')).toBe(false)
  })

  it('still matches real page and API routes', () => {
    expect(matcher.test('/dashboard')).toBe(true)
    expect(matcher.test('/pl/qr')).toBe(true)
    expect(matcher.test('/api/orders')).toBe(true)
  })
})

const PROP = 'prop-abc'
const SESSION_ID = 'session-1'

function makeAdmin(
  session: {
    id: string
    revoked: boolean
    expires_at: string
    property_id: string
    last_seen_at: string
    auth_level: number
    reservation_id: string | null
    room_id: string | null
  } | null
) {
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
    auth_level: 2,
    reservation_id: 'res-1',
    room_id: 'room-1',
  }
}

function requestWithSession(url: string) {
  return new NextRequest(url, { headers: { cookie: `__Host-session=${SESSION_ID}` } })
}

function requestWithAdminCookie(url: string, token?: string) {
  return new NextRequest(url, {
    headers: token ? { cookie: `admin_token=${token}` } : {},
  })
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

describe('proxy: guest session headers forwarded to downstream request', () => {
  beforeEach(() => vi.resetAllMocks())

  it('forwards auth_level/reservation_id/room_id from the sessions row, without a second lookup', async () => {
    const admin = makeAdmin(makeSession())
    mockCreateServiceRoleClient.mockReturnValue(admin as never)

    const response = await proxy(requestWithSession('http://localhost/api/some-route'))

    expect(response.headers.get('x-middleware-request-x-property-id')).toBe(PROP)
    expect(response.headers.get('x-middleware-request-x-session-id')).toBe(SESSION_ID)
    expect(response.headers.get('x-middleware-request-x-session-auth-level')).toBe('2')
    expect(response.headers.get('x-middleware-request-x-session-reservation-id')).toBe('res-1')
    expect(response.headers.get('x-middleware-request-x-session-room-id')).toBe('room-1')
    // Exactly one `sessions` lookup for the whole request (the last_seen_at update is skipped
    // for /api/ routes) — the second lookup this test used to require in lib/guest/session.ts
    // is gone now that auth_level/reservation_id/room_id are forwarded via headers instead.
    expect(admin.from).toHaveBeenCalledTimes(1)
  })

  it('omits reservation/room headers when the session has neither', async () => {
    const admin = makeAdmin({ ...makeSession(), reservation_id: null, room_id: null })
    mockCreateServiceRoleClient.mockReturnValue(admin as never)

    const response = await proxy(requestWithSession('http://localhost/api/some-route'))

    expect(response.headers.get('x-middleware-request-x-session-reservation-id')).toBeNull()
    expect(response.headers.get('x-middleware-request-x-session-room-id')).toBeNull()
  })
})

describe('proxy: admin auth', () => {
  const ORIGINAL_TOKEN = process.env.ADMIN_ACCESS_TOKEN

  beforeEach(() => {
    vi.resetAllMocks()
    process.env.ADMIN_ACCESS_TOKEN = 'correct-token'
  })

  afterEach(() => {
    process.env.ADMIN_ACCESS_TOKEN = ORIGINAL_TOKEN
  })

  it('redirects /admin to /admin/login when cookie is missing', async () => {
    const response = await proxy(requestWithAdminCookie('http://localhost/admin'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost:3000/admin/login')
  })

  it('redirects /admin to /admin/login when cookie is wrong', async () => {
    const response = await proxy(requestWithAdminCookie('http://localhost/admin', 'wrong-token'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost:3000/admin/login')
  })

  it('allows /admin through when cookie matches ADMIN_ACCESS_TOKEN', async () => {
    const response = await proxy(requestWithAdminCookie('http://localhost/admin', 'correct-token'))

    expect(response.status).toBe(200)
  })

  it('allows /admin/login through without checking the cookie', async () => {
    const response = await proxy(requestWithAdminCookie('http://localhost/admin/login'))

    expect(response.status).toBe(200)
  })
})
