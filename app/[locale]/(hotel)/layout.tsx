import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getHotelUser } from '@/lib/panel/auth'
import { getVisibleNavItems } from '@/lib/panel/nav-items'
import { SidebarNav } from '@/components/panel/sidebar-nav'
import { ThemeToggle } from '@/components/panel/theme-toggle'
import { Button } from '@/components/ui/button'

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

  const navItems = getVisibleNavItems(hotelUser.role)

  return (
    <div data-theme="panel" className="flex min-h-screen flex-col bg-panel-bg font-ui text-panel-ink">
      <header className="flex h-14 shrink-0 items-center border-b border-border bg-panel-surface px-4">
        <span className="font-display text-sm font-semibold text-panel-ink">Hotel Guest App</span>
      </header>
      <div className="flex flex-1">
        <SidebarNav items={navItems}>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <form action="/api/auth/sign-out" method="POST" className="flex-1">
              <Button type="submit" variant="outline" size="sm" className="w-full">
                Sign out
              </Button>
            </form>
          </div>
        </SidebarNav>
        <div className="flex-1">{children}</div>
      </div>
    </div>
  )
}
