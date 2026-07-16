import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getHotelUser } from '@/lib/panel/auth'

export default async function KioskLayout({ children }: { children: React.ReactNode }) {
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
    <div data-theme="panel" className="h-screen w-screen overflow-hidden bg-panel-bg font-ui text-panel-ink">
      {children}
    </div>
  )
}
