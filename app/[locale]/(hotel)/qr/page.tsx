import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createServerClient } from '@/lib/supabase/server'
import { getHotelUser } from '@/lib/panel/auth'
import { canPerform } from '@/lib/panel/rbac'
import { generateQRImage } from '@/lib/qr/image'
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
          <p className="rounded border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-900">
            {t('dpaBlocked.message')}
          </p>
        </main>
      </RequirePermission>
    )
  }

  const [{ data: receptionQr }, { data: rooms }, { data: roomQrs }, sessionCount] = await Promise.all([
    supabase
      .from('qr_codes')
      .select('id, init_token, created_at, expires_at')
      .eq('property_id', hotelUser.propertyId)
      .eq('type', 'reception')
      .eq('is_active', true)
      .maybeSingle(),
    supabase
      .from('rooms')
      .select('id, room_number, room_type')
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

  const roomQrByRoomId = new Map((roomQrs ?? []).map(qr => [qr.room_id, qr]))
  const roomsWithQr: RoomWithQr[] = (rooms ?? []).map(room => ({
    id: room.id,
    roomNumber: room.room_number,
    roomType: room.room_type,
    activeQr: roomQrByRoomId.has(room.id) ? { id: roomQrByRoomId.get(room.id)!.id } : null,
  }))

  const receptionQrImage = receptionQr
    ? await generateQRImage(
        `${process.env.NEXT_PUBLIC_APP_URL}/api/scan/reception?init_token=${receptionQr.init_token}`
      )
    : null

  const canEdit = canPerform(hotelUser.role, 'qr_manage', 'write')

  return (
    <RequirePermission role={hotelUser.role} resource="qr_sessions" level="read">
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="mb-6 text-2xl font-semibold">{t('page.title')}</h1>
        <QrPanel
          receptionQr={
            receptionQr ? { id: receptionQr.id, expiresAt: receptionQr.expires_at, image: receptionQrImage } : null
          }
          rooms={roomsWithQr}
          sessionCount={sessionCount}
          canEdit={canEdit}
        />
      </main>
    </RequirePermission>
  )
}
