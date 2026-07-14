// `localePrefix: 'never'` (i18n/routing.ts) means the proxy (Next's renamed
// middleware, proxy.ts) rewrites to /pl/* or /en/* only on the server — the
// browser, and therefore every request the SW sees, always uses the bare
// path (e.g. `/concierge`, not `/pl/concierge`). Route groups (guest)/(hotel)/
// (hotel-auth) add no URL segment either, so an allowlist of the actual bare
// guest paths is the only reliable way to scope caching to guest pages.
const GUEST_NAV_PATTERNS: RegExp[] = [
  /^\/$/,
  /^\/c(\/.*)?$/,
  /^\/amenities$/,
  /^\/concierge$/,
  /^\/my-orders$/,
  /^\/my-stay$/,
  /^\/discover$/,
  /^\/order-success$/,
  /^\/error$/,
  /^\/offline$/,
]

interface MatchInput {
  request: Request
  url: URL
}

// `/scan` deliberately excluded: scanning has a side effect (session
// elevation) and must never be served from cache.
export function isGuestNavigationRequest({ request, url }: MatchInput): boolean {
  if (request.destination !== 'document') return false
  return GUEST_NAV_PATTERNS.some((pattern) => pattern.test(url.pathname))
}

export function isGuestOrdersGet({ request, url }: MatchInput): boolean {
  return request.method === 'GET' && url.pathname === '/api/orders/guest'
}

export function isNetworkOnlyApi({ request, url }: MatchInput): boolean {
  return (
    (request.method === 'POST' && url.pathname === '/api/orders') ||
    (request.method === 'POST' && url.pathname.startsWith('/api/concierge/')) ||
    url.pathname.startsWith('/api/scan/') ||
    url.pathname.startsWith('/api/auth/') ||
    (request.method === 'POST' && url.pathname.startsWith('/api/invite/')) ||
    (request.method === 'POST' && url.pathname.startsWith('/api/panel/')) ||
    (request.method === 'POST' && url.pathname.startsWith('/api/cron/')) ||
    url.pathname.startsWith('/api/orders/stream')
  )
}
