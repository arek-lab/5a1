import { NextRequest, NextResponse } from 'next/server'
import { absoluteUrl } from '@/lib/http/app-url'

const RETRY_COOKIE = 'scan_retry_count'
const MAX_RETRIES = 2

// Guest re-scans a static, printed QR code — a fresh top-level navigation with no
// place to carry retry state except a cookie.
export function retryOrErrorRedirect(
  request: NextRequest,
  errorType: string,
  propertyId: string | undefined
): NextResponse {
  const attempts = Number(request.cookies.get(RETRY_COOKIE)?.value ?? '0')

  if (attempts >= MAX_RETRIES) {
    const redirectUrl = absoluteUrl(`/error?type=${errorType}`)
    if (propertyId) redirectUrl.searchParams.set('property_id', propertyId)
    const response = NextResponse.redirect(redirectUrl)
    response.cookies.delete({ name: RETRY_COOKIE, path: '/' })
    return response
  }

  const response = NextResponse.redirect(absoluteUrl('/scan?retry=1'))
  response.cookies.set(RETRY_COOKIE, String(attempts + 1), {
    path: '/',
    maxAge: 600,
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
  })
  return response
}

export function clearScanRetryCookie(response: NextResponse): void {
  response.cookies.delete({ name: RETRY_COOKIE, path: '/' })
}
