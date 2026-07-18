import type { NextResponse } from 'next/server'

// Persistent, not a browser-session cookie: mobile OSes kill the browser/PWA process
// between visits, wiping session cookies — the guest would come back "logged out"
// despite a still-valid sessions row. Expiry mirrors the row's expires_at so the
// cookie and the server-side session lapse together.
//
// Lax, not Strict: this cookie is minted mid-redirect on a top-level navigation that
// usually arrives from outside the app (the phone's camera app opening the QR link) —
// Strict is documented to drop a freshly-set cookie on exactly that first external-entry
// navigation, which showed up in production as insufficient_auth on the very first reception
// scan, self-healing on the guest's next (in-site) navigation. Lax still blocks the cookie
// from cross-site subrequests/POSTs; it only additionally allows top-level GET navigations.
export function setSessionCookie(
  response: NextResponse,
  sessionId: string,
  expiresAt: string | Date
): void {
  response.cookies.set('__Host-session', sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    expires: new Date(expiresAt),
  })
}
