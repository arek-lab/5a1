import { describe, it, expect } from 'vitest'
import { getVisibleNavItems } from '../nav-items'

describe('getVisibleNavItems', () => {
  it('owner: sees all 6 items', () => {
    const hrefs = getVisibleNavItems('owner').map((i) => i.href)
    expect(hrefs).toEqual(['/dashboard', '/services', '/knowledge', '/qr', '/orders', '/users'])
  })

  it('admin: sees all 6 items', () => {
    const hrefs = getVisibleNavItems('admin').map((i) => i.href)
    expect(hrefs).toEqual(['/dashboard', '/services', '/knowledge', '/qr', '/orders', '/users'])
  })

  it('staff: sees 5 items (no Users — users: none)', () => {
    const hrefs = getVisibleNavItems('staff').map((i) => i.href)
    expect(hrefs).toEqual(['/dashboard', '/services', '/knowledge', '/qr', '/orders'])
    expect(hrefs).not.toContain('/users')
  })

  it('viewer: does not see QR or Users (qr_manage/users: none)', () => {
    const hrefs = getVisibleNavItems('viewer').map((i) => i.href)
    expect(hrefs).toEqual(['/dashboard', '/services', '/knowledge', '/orders'])
    expect(hrefs).not.toContain('/qr')
    expect(hrefs).not.toContain('/users')
  })
})
