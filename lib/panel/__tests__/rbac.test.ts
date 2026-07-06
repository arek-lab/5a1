import { describe, it, expect } from 'vitest'
import { canPerform } from '../rbac'

describe('hotel_profile', () => {
  it('owner: full', () => {
    expect(canPerform('owner', 'hotel_profile', 'full')).toBe(true)
  })
  it('admin: full', () => {
    expect(canPerform('admin', 'hotel_profile', 'full')).toBe(true)
  })
  it('staff: read (not write)', () => {
    expect(canPerform('staff', 'hotel_profile', 'read')).toBe(true)
    expect(canPerform('staff', 'hotel_profile', 'write')).toBe(false)
  })
  it('viewer: read (not write)', () => {
    expect(canPerform('viewer', 'hotel_profile', 'read')).toBe(true)
    expect(canPerform('viewer', 'hotel_profile', 'write')).toBe(false)
  })
})

describe('services', () => {
  it('owner: full', () => {
    expect(canPerform('owner', 'services', 'full')).toBe(true)
  })
  it('admin: full', () => {
    expect(canPerform('admin', 'services', 'full')).toBe(true)
  })
  it('staff: write (not full)', () => {
    expect(canPerform('staff', 'services', 'write')).toBe(true)
    expect(canPerform('staff', 'services', 'full')).toBe(false)
  })
  it('viewer: read (not write)', () => {
    expect(canPerform('viewer', 'services', 'read')).toBe(true)
    expect(canPerform('viewer', 'services', 'write')).toBe(false)
  })
})

describe('knowledge', () => {
  it('owner: full', () => {
    expect(canPerform('owner', 'knowledge', 'full')).toBe(true)
  })
  it('admin: full', () => {
    expect(canPerform('admin', 'knowledge', 'full')).toBe(true)
  })
  it('staff: write (not full)', () => {
    expect(canPerform('staff', 'knowledge', 'write')).toBe(true)
    expect(canPerform('staff', 'knowledge', 'full')).toBe(false)
  })
  it('viewer: read (not write)', () => {
    expect(canPerform('viewer', 'knowledge', 'read')).toBe(true)
    expect(canPerform('viewer', 'knowledge', 'write')).toBe(false)
  })
})

describe('qr_manage', () => {
  it('owner: full', () => {
    expect(canPerform('owner', 'qr_manage', 'full')).toBe(true)
  })
  it('admin: full', () => {
    expect(canPerform('admin', 'qr_manage', 'full')).toBe(true)
  })
  it('staff: full', () => {
    expect(canPerform('staff', 'qr_manage', 'full')).toBe(true)
  })
  it('viewer: none (not read)', () => {
    expect(canPerform('viewer', 'qr_manage', 'none')).toBe(true)
    expect(canPerform('viewer', 'qr_manage', 'read')).toBe(false)
  })
})

describe('qr_sessions', () => {
  it('owner: full', () => {
    expect(canPerform('owner', 'qr_sessions', 'full')).toBe(true)
  })
  it('admin: full', () => {
    expect(canPerform('admin', 'qr_sessions', 'full')).toBe(true)
  })
  it('staff: full', () => {
    expect(canPerform('staff', 'qr_sessions', 'full')).toBe(true)
  })
  it('viewer: read (not write)', () => {
    expect(canPerform('viewer', 'qr_sessions', 'read')).toBe(true)
    expect(canPerform('viewer', 'qr_sessions', 'write')).toBe(false)
  })
})

describe('orders_view', () => {
  it('owner: full', () => {
    expect(canPerform('owner', 'orders_view', 'full')).toBe(true)
  })
  it('admin: full', () => {
    expect(canPerform('admin', 'orders_view', 'full')).toBe(true)
  })
  it('staff: full', () => {
    expect(canPerform('staff', 'orders_view', 'full')).toBe(true)
  })
  it('viewer: read (not write)', () => {
    expect(canPerform('viewer', 'orders_view', 'read')).toBe(true)
    expect(canPerform('viewer', 'orders_view', 'write')).toBe(false)
  })
})

describe('orders_status', () => {
  it('owner: full', () => {
    expect(canPerform('owner', 'orders_status', 'full')).toBe(true)
  })
  it('admin: full', () => {
    expect(canPerform('admin', 'orders_status', 'full')).toBe(true)
  })
  it('staff: full', () => {
    expect(canPerform('staff', 'orders_status', 'full')).toBe(true)
  })
  // DoD: viewer cannot POST status change
  it('viewer: none (not read)', () => {
    expect(canPerform('viewer', 'orders_status', 'none')).toBe(true)
    expect(canPerform('viewer', 'orders_status', 'read')).toBe(false)
  })
})

describe('orders_export', () => {
  it('owner: full', () => {
    expect(canPerform('owner', 'orders_export', 'full')).toBe(true)
  })
  it('admin: full', () => {
    expect(canPerform('admin', 'orders_export', 'full')).toBe(true)
  })
  it('staff: none (not read)', () => {
    expect(canPerform('staff', 'orders_export', 'none')).toBe(true)
    expect(canPerform('staff', 'orders_export', 'read')).toBe(false)
  })
  it('viewer: full', () => {
    expect(canPerform('viewer', 'orders_export', 'full')).toBe(true)
  })
})

describe('users', () => {
  it('owner: full', () => {
    expect(canPerform('owner', 'users', 'full')).toBe(true)
  })
  it('admin: full', () => {
    expect(canPerform('admin', 'users', 'full')).toBe(true)
  })
  it('staff: none (not read)', () => {
    expect(canPerform('staff', 'users', 'none')).toBe(true)
    expect(canPerform('staff', 'users', 'read')).toBe(false)
  })
  it('viewer: none (not read)', () => {
    expect(canPerform('viewer', 'users', 'none')).toBe(true)
    expect(canPerform('viewer', 'users', 'read')).toBe(false)
  })
})

describe('dashboard', () => {
  it('owner: full', () => {
    expect(canPerform('owner', 'dashboard', 'full')).toBe(true)
  })
  it('admin: full', () => {
    expect(canPerform('admin', 'dashboard', 'full')).toBe(true)
  })
  it('staff: read (not write)', () => {
    expect(canPerform('staff', 'dashboard', 'read')).toBe(true)
    expect(canPerform('staff', 'dashboard', 'write')).toBe(false)
  })
  it('viewer: full', () => {
    expect(canPerform('viewer', 'dashboard', 'full')).toBe(true)
  })
})

describe('billing', () => {
  // DoD: owner can see billing
  it('owner: full', () => {
    expect(canPerform('owner', 'billing', 'full')).toBe(true)
  })
  it('admin: none (not read)', () => {
    expect(canPerform('admin', 'billing', 'none')).toBe(true)
    expect(canPerform('admin', 'billing', 'read')).toBe(false)
  })
  // DoD: staff cannot see billing
  it('staff: none (not read)', () => {
    expect(canPerform('staff', 'billing', 'none')).toBe(true)
    expect(canPerform('staff', 'billing', 'read')).toBe(false)
  })
  it('viewer: none (not read)', () => {
    expect(canPerform('viewer', 'billing', 'none')).toBe(true)
    expect(canPerform('viewer', 'billing', 'read')).toBe(false)
  })
})

describe('transfer_ownership', () => {
  it('owner: full', () => {
    expect(canPerform('owner', 'transfer_ownership', 'full')).toBe(true)
  })
  it('admin: none (not read)', () => {
    expect(canPerform('admin', 'transfer_ownership', 'none')).toBe(true)
    expect(canPerform('admin', 'transfer_ownership', 'read')).toBe(false)
  })
  it('staff: none (not read)', () => {
    expect(canPerform('staff', 'transfer_ownership', 'none')).toBe(true)
    expect(canPerform('staff', 'transfer_ownership', 'read')).toBe(false)
  })
  it('viewer: none (not read)', () => {
    expect(canPerform('viewer', 'transfer_ownership', 'none')).toBe(true)
    expect(canPerform('viewer', 'transfer_ownership', 'read')).toBe(false)
  })
})
