import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createServerClient } from '@/lib/supabase/server'
import { getHotelUser } from '@/lib/panel/auth'
import { canPerform } from '@/lib/panel/rbac'
import RequirePermission from '@/components/panel/require-permission'
import ServiceList, { type ServiceRecord } from './service-list'

export default async function ServicesPage() {
  const hotelUser = await getHotelUser()
  if (!hotelUser) redirect('/login')

  const supabase = await createServerClient()
  const { data: services } = await supabase
    .from('services')
    .select('id, template_key, name, description, category, price_cents, image_url, is_active, is_pinned')
    .eq('property_id', hotelUser.propertyId)
    .order('category')
    .order('name')

  const canEdit = canPerform(hotelUser.role, 'services', 'write')
  const t = await getTranslations('services.list')

  return (
    <RequirePermission role={hotelUser.role} resource="services" level="read">
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="mb-6 text-2xl font-semibold">{t('title')}</h1>
        <ServiceList services={(services ?? []) as ServiceRecord[]} canEdit={canEdit} />
      </main>
    </RequirePermission>
  )
}
