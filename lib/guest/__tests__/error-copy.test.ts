import { describe, it, expect } from 'vitest'
import { resolveErrorGroup } from '../error-copy'

describe('resolveErrorGroup', () => {
  it.each([
    ['token_expired', 'expired'],
    ['session_expired', 'expired'],
    ['token_not_found', 'invalid'],
    ['token_used', 'invalid'],
    ['missing_session_cookie', 'invalid'],
    ['session_not_found', 'invalid'],
    ['session_revoked', 'invalid'],
    ['auth_failed', 'invalid'],
    ['insufficient_auth', 'insufficient_access'],
    ['wrong_auth_level', 'insufficient_access'],
    ['room_qr_not_found', 'generic'],
    ['outside_window', 'generic'],
    ['no_active_reservation', 'generic'],
  ] as const)('maps %s to %s', (type, group) => {
    expect(resolveErrorGroup(type)).toBe(group)
  })

  it('falls back to generic for an unrecognized type', () => {
    expect(resolveErrorGroup('something_unexpected')).toBe('generic')
  })

  it('falls back to generic for undefined', () => {
    expect(resolveErrorGroup(undefined)).toBe('generic')
  })
})
