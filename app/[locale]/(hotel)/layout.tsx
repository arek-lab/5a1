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
      <header className="flex justify-end border-b bg-white p-4 text-gray-900">
        <form action="/api/auth/sign-out" method="POST">
          <button
            type="submit"
            className="rounded border px-3 py-1.5 text-sm font-medium hover:bg-gray-100"
          >
            Sign out
          </button>
        </form>
      </header>
      {children}
    </>
  )
}
