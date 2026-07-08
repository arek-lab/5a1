import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createServerClient } from '@/lib/supabase/server'
import { getHotelUser } from '@/lib/panel/auth'
import { canPerform } from '@/lib/panel/rbac'
import RequirePermission from '@/components/panel/require-permission'
import OrdersPanel, { type OrderRecord, type RoomOption, type ServiceOption } from './orders-panel'

export default async function OrdersPage() {
  const hotelUser = await getHotelUser()
  if (!hotelUser) redirect('/login')

  const supabase = await createServerClient()
  const t = await getTranslations('orders')

  const [{ data: orders }, { data: rooms }, { data: services }] = await Promise.all([
    supabase
      .from('orders')
      .select('id, status, price_cents, note, created_at, room_id, service_id')
      .eq('property_id', hotelUser.propertyId)
      .order('created_at', { ascending: false }),
    supabase
      .from('rooms')
      .select('id, room_number')
      .eq('property_id', hotelUser.propertyId),
    supabase
      .from('services')
      .select('id, name')
      .eq('property_id', hotelUser.propertyId),
  ])

  const roomOptions: RoomOption[] = rooms ?? []
  const serviceOptions: ServiceOption[] = services ?? []
  const roomById = new Map(roomOptions.map(r => [r.id, r.room_number]))
  const serviceById = new Map(serviceOptions.map(s => [s.id, s.name]))

  const initialOrders: OrderRecord[] = (orders ?? []).map(o => ({
    id: o.id,
    status: o.status,
    priceCents: o.price_cents,
    note: o.note,
    createdAt: o.created_at,
    roomNumber: o.room_id ? roomById.get(o.room_id) ?? null : null,
    serviceName: o.service_id ? serviceById.get(o.service_id) ?? '' : '',
  }))

  const canEditStatus = canPerform(hotelUser.role, 'orders_status', 'write')
  const canExport = canPerform(hotelUser.role, 'orders_export', 'read')

  return (
    <RequirePermission role={hotelUser.role} resource="orders_view" level="read">
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="mb-6 text-2xl font-semibold">{t('page.title')}</h1>
        <OrdersPanel
          initialOrders={initialOrders}
          rooms={roomOptions}
          services={serviceOptions}
          canEditStatus={canEditStatus}
          canExport={canExport}
        />
      </main>
    </RequirePermission>
  )
}
