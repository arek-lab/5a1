import { describe, it, expect } from 'vitest'
import { isGuestNavigationRequest, isGuestOrdersGet, isNetworkOnlyApi } from '@/lib/sw/matchers'

function nav(pathname: string, base = 'https://example.com') {
  const url = new URL(pathname, base)
  const request = { destination: 'document', method: 'GET', url: url.toString() } as Request
  return { request, url }
}

function api(pathname: string, method: string, base = 'https://example.com') {
  const url = new URL(pathname, base)
  const request = { destination: '', method, url: url.toString() } as Request
  return { request, url }
}

describe('isGuestNavigationRequest', () => {
  it('matches known guest navigation paths (bare, no locale prefix — localePrefix: never)', () => {
    expect(isGuestNavigationRequest(nav('/'))).toBe(true)
    expect(isGuestNavigationRequest(nav('/c'))).toBe(true)
    expect(isGuestNavigationRequest(nav('/c/spa'))).toBe(true)
    expect(isGuestNavigationRequest(nav('/amenities'))).toBe(true)
    expect(isGuestNavigationRequest(nav('/concierge'))).toBe(true)
    expect(isGuestNavigationRequest(nav('/my-orders'))).toBe(true)
    expect(isGuestNavigationRequest(nav('/my-stay'))).toBe(true)
    expect(isGuestNavigationRequest(nav('/discover'))).toBe(true)
    expect(isGuestNavigationRequest(nav('/order-success'))).toBe(true)
    expect(isGuestNavigationRequest(nav('/error'))).toBe(true)
    expect(isGuestNavigationRequest(nav('/offline'))).toBe(true)
  })

  it('rejects scan (session-elevation side effect)', () => {
    expect(isGuestNavigationRequest(nav('/scan'))).toBe(false)
  })

  it('rejects hotel-panel and hotel-auth paths', () => {
    expect(isGuestNavigationRequest(nav('/dashboard'))).toBe(false)
    expect(isGuestNavigationRequest(nav('/knowledge'))).toBe(false)
    expect(isGuestNavigationRequest(nav('/onboarding'))).toBe(false)
    expect(isGuestNavigationRequest(nav('/orders'))).toBe(false)
    expect(isGuestNavigationRequest(nav('/qr'))).toBe(false)
    expect(isGuestNavigationRequest(nav('/services'))).toBe(false)
    expect(isGuestNavigationRequest(nav('/users'))).toBe(false)
    expect(isGuestNavigationRequest(nav('/login'))).toBe(false)
    expect(isGuestNavigationRequest(nav('/signup'))).toBe(false)
    expect(isGuestNavigationRequest(nav('/unauthorized'))).toBe(false)
  })

  it('rejects the admin panel', () => {
    expect(isGuestNavigationRequest(nav('/admin'))).toBe(false)
    expect(isGuestNavigationRequest(nav('/admin/login'))).toBe(false)
  })

  it('rejects non-document requests even for allowlisted paths', () => {
    const url = new URL('/', 'https://example.com')
    const request = { destination: 'image', method: 'GET', url: url.toString() } as Request
    expect(isGuestNavigationRequest({ request, url })).toBe(false)
  })
})

describe('isGuestOrdersGet', () => {
  it('matches only GET /api/orders/guest', () => {
    expect(isGuestOrdersGet(api('/api/orders/guest', 'GET'))).toBe(true)
  })

  it('rejects other methods and paths', () => {
    expect(isGuestOrdersGet(api('/api/orders/guest', 'POST'))).toBe(false)
    expect(isGuestOrdersGet(api('/api/orders', 'GET'))).toBe(false)
  })
})

describe('isNetworkOnlyApi', () => {
  it('matches order/concierge/scan/auth/invite/panel/cron mutations and the SSE stream', () => {
    expect(isNetworkOnlyApi(api('/api/orders', 'POST'))).toBe(true)
    expect(isNetworkOnlyApi(api('/api/concierge/stream', 'POST'))).toBe(true)
    expect(isNetworkOnlyApi(api('/api/scan/room', 'GET'))).toBe(true)
    expect(isNetworkOnlyApi(api('/api/auth/sign-out', 'POST'))).toBe(true)
    expect(isNetworkOnlyApi(api('/api/invite/activate', 'POST'))).toBe(true)
    expect(isNetworkOnlyApi(api('/api/panel/auth/login-event', 'POST'))).toBe(true)
    expect(isNetworkOnlyApi(api('/api/cron/retention', 'POST'))).toBe(true)
    expect(isNetworkOnlyApi(api('/api/orders/stream', 'GET'))).toBe(true)
  })

  it('does not match the guest orders read', () => {
    expect(isNetworkOnlyApi(api('/api/orders/guest', 'GET'))).toBe(false)
  })
})
