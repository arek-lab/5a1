export type ErrorGroup = 'expired' | 'invalid' | 'insufficient_access' | 'generic'

const EXPIRED = new Set(['token_expired', 'session_expired'])
const INVALID = new Set([
  'token_not_found',
  'token_used',
  'missing_session_cookie',
  'session_not_found',
  'session_revoked',
  'auth_failed',
])
const INSUFFICIENT_ACCESS = new Set(['insufficient_auth', 'wrong_auth_level'])

export function resolveErrorGroup(type: string | undefined): ErrorGroup {
  if (type === undefined) return 'generic'
  if (EXPIRED.has(type)) return 'expired'
  if (INVALID.has(type)) return 'invalid'
  if (INSUFFICIENT_ACCESS.has(type)) return 'insufficient_access'
  return 'generic'
}
