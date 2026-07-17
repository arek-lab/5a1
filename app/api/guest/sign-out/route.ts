import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { absoluteUrl } from '@/lib/http/app-url'

export async function POST() {
  const cookieStore = await cookies()
  const sessionId = cookieStore.get('__Host-session')?.value

  let propertyId: string | undefined
  if (sessionId) {
    const admin = createServiceRoleClient()
    const { data } = await admin.from('sessions').select('property_id').eq('id', sessionId).single()
    propertyId = data?.property_id
    await admin.from('sessions').update({ revoked: true }).eq('id', sessionId)
  }

  const redirectUrl = absoluteUrl('/error?type=signed_out')
  if (propertyId) redirectUrl.searchParams.set('property_id', propertyId)

  const response = NextResponse.redirect(redirectUrl)
  // __Host- prefixed cookies require Secure (and Path=/) on every Set-Cookie, including
  // clearing ones — see proxy.ts for the same gotcha on the automatic-invalidation path.
  response.cookies.delete({ name: '__Host-session', path: '/', secure: true })
  return response
}
