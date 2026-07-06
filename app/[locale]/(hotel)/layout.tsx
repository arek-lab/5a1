import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getHotelUser } from '@/lib/panel/auth'

export default async function HotelLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const hotelUser = await getHotelUser()

  if (!hotelUser) {
    redirect('/api/auth/sign-out?error=no_access')
  }

  return (
    <>
      <header>
        <form action="/api/auth/sign-out" method="POST">
          <button type="submit">Sign out</button>
        </form>
      </header>
      {children}
    </>
  )
}
