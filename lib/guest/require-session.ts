import { redirect } from 'next/navigation'
import { getGuestSessionContext, type GuestSessionContext } from './session'

export async function requireGuestSession(): Promise<GuestSessionContext> {
  const context = await getGuestSessionContext()
  if (!context) redirect('/error?type=insufficient_auth')
  return context
}
