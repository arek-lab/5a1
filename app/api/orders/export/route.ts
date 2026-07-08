import { NextRequest, NextResponse } from 'next/server'
import { getHotelUser } from '@/lib/panel/auth'
import { canPerform } from '@/lib/panel/rbac'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { OrderStatus } from '@/lib/orders/status'
import { buildOrdersCsv } from '@/lib/orders/csv'

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const hotelUser = await getHotelUser()
  if (!hotelUser) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!canPerform(hotelUser.role, 'orders_export', 'read')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { searchParams } = request.nextUrl
  const statuses = searchParams.getAll('status') as OrderStatus[]
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  const serviceRole = createServiceRoleClient()

  let query = serviceRole
    .from('orders')
    .select('id, status, price_cents, note, created_at, room_id, service_id')
    .eq('property_id', hotelUser.propertyId)
    .order('created_at', { ascending: false })

  if (statuses.length > 0) query = query.in('status', statuses)
  if (from) query = query.gte('created_at', from)
  if (to) query = query.lte('created_at', to)

  const [{ data: orders }, { data: rooms }, { data: services }, { data: property }] = await Promise.all([
    query,
    serviceRole.from('rooms').select('id, room_number').eq('property_id', hotelUser.propertyId),
    serviceRole.from('services').select('id, name').eq('property_id', hotelUser.propertyId),
    serviceRole.from('properties').select('name').eq('id', hotelUser.propertyId).single(),
  ])

  const roomById = new Map((rooms ?? []).map(r => [r.id, r.room_number]))
  const serviceById = new Map((services ?? []).map(s => [s.id, s.name]))

  const csv = buildOrdersCsv(
    (orders ?? []).map(o => ({
      createdAt: o.created_at,
      roomNumber: o.room_id ? roomById.get(o.room_id) ?? '' : '',
      serviceName: serviceById.get(o.service_id) ?? '',
      priceCents: o.price_cents,
      status: o.status,
      note: o.note ?? '',
    }))
  )

  const propertySlug = slugify(property?.name ?? hotelUser.propertyId)
  const dateStr = new Date().toISOString().slice(0, 10)

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="zamowienia-${propertySlug}-${dateStr}.csv"`,
    },
  })
}
