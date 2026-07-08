import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createServerClient } from '@/lib/supabase/server'
import { getHotelUser } from '@/lib/panel/auth'
import { canPerform } from '@/lib/panel/rbac'
import RequirePermission from '@/components/panel/require-permission'
import UserList, { type HotelUserRecord } from './user-list'

export default async function UsersPage() {
  const hotelUser = await getHotelUser()
  if (!hotelUser) redirect('/login')

  const supabase = await createServerClient()
  const { data: users } = await supabase
    .from('hotel_users')
    .select('id, email, full_name, role, status, invite_expires_at, last_login_at')
    .eq('property_id', hotelUser.propertyId)
    .order('role')
    .order('email')

  const canEdit = canPerform(hotelUser.role, 'users', 'write')
  const t = await getTranslations('users.list')

  return (
    <RequirePermission role={hotelUser.role} resource="users" level="read">
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="mb-6 text-2xl font-semibold">{t('title')}</h1>
        <UserList
          users={(users ?? []) as HotelUserRecord[]}
          canEdit={canEdit}
          currentUserId={hotelUser.id}
        />
      </main>
    </RequirePermission>
  )
}
