import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createServerClient } from '@/lib/supabase/server'
import { getHotelUser } from '@/lib/panel/auth'
import { canPerform } from '@/lib/panel/rbac'
import { generateQRImage } from '@/lib/qr/image'
import { getActiveReceptionQr } from '@/lib/qr/query'
import { getActiveReceptionSessionCount } from '@/lib/qr/session-count'
import RequirePermission from '@/components/panel/require-permission'
import QrPanel, { type RoomWithQr } from './qr-panel'

export default async function QrPage() {
  const hotelUser = await getHotelUser()
  if (!hotelUser) redirect('/login')

  const supabase = await createServerClient()
  const t = await getTranslations('qr')

  const { data: property } = await supabase
    .from('properties')
    .select('dpa_signed_at')
    .eq('id', hotelUser.propertyId)
    .single()

  if (!property?.dpa_signed_at) {
    return (
      <RequirePermission role={hotelUser.role} resource="qr_sessions" level="read">
        <main className="mx-auto max-w-4xl p-6">
          <h1 className="mb-6 text-2xl font-semibold">{t('page.title')}</h1>
          <p className="rounded-md border border-panel-warning/30 bg-panel-warning/10 px-4 py-3 text-sm text-panel-warning">
            {t('dpaBlocked.message')}
          </p>
        </main>
      </RequirePermission>
    )
  }

  const [receptionQr, { data: rooms }, { data: roomQrs }, sessionCount] = await Promise.all([
    getActiveReceptionQr(hotelUser.propertyId),
    supabase
      .from('rooms')
      .select('id, room_number, room_type, room_active_reservation_id')
      .eq('property_id', hotelUser.propertyId)
      .order('room_number'),
    supabase
      .from('qr_codes')
      .select('id, room_id')
      .eq('property_id', hotelUser.propertyId)
      .eq('type', 'room')
      .eq('is_active', true),
    getActiveReceptionSessionCount(hotelUser.propertyId),
  ])

  const activeReservationIds = (rooms ?? [])
    .map(room => room.room_active_reservation_id)
    .filter((id): id is string => id !== null)

  const { data: reservations } =
    activeReservationIds.length > 0
      ? await supabase
          .from('reservations')
          .select('id, room_id, check_out')
          .in('id', activeReservationIds)
      : { data: [] }

  const reservationByRoomId = new Map((reservations ?? []).map(res => [res.room_id, res]))
  const roomQrByRoomId = new Map((roomQrs ?? []).map(qr => [qr.room_id, qr]))
  const roomsWithQr: RoomWithQr[] = (rooms ?? []).map(room => {
    const reservation = reservationByRoomId.get(room.id)
    return {
      id: room.id,
      roomNumber: room.room_number,
      roomType: room.room_type,
      activeQr: roomQrByRoomId.has(room.id) ? { id: roomQrByRoomId.get(room.id)!.id } : null,
      activeReservation: reservation ? { id: reservation.id, checkOut: reservation.check_out } : null,
    }
  })

  const receptionQrImage = receptionQr
    ? await generateQRImage(
        `${process.env.NEXT_PUBLIC_APP_URL}/api/scan/reception?init_token=${receptionQr.initToken}`
      )
    : null

  const canEdit = canPerform(hotelUser.role, 'qr_manage', 'write')
  const canManageRooms = canPerform(hotelUser.role, 'rooms_manage', 'write')

  return (
    <RequirePermission role={hotelUser.role} resource="qr_sessions" level="read">
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="mb-6 text-2xl font-semibold">{t('page.title')}</h1>
        <QrPanel
          receptionQr={
            receptionQr ? { id: receptionQr.id, expiresAt: receptionQr.expiresAt, image: receptionQrImage } : null
          }
          rooms={roomsWithQr}
          sessionCount={sessionCount}
          canEdit={canEdit}
          canManageRooms={canManageRooms}
        />
      </main>
    </RequirePermission>
  )
}
