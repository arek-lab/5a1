import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createServerClient } from '@/lib/supabase/server'
import { getHotelUser } from '@/lib/panel/auth'
import { generateQRImage } from '@/lib/qr/image'
import RequirePermission from '@/components/panel/require-permission'
import PrintRoomQrList from './print-room-qr-list'

export default async function QrPrintPage() {
  const hotelUser = await getHotelUser()
  if (!hotelUser) redirect('/login')

  const supabase = await createServerClient()
  const t = await getTranslations('qr')

  const [{ data: rooms }, { data: roomQrs }] = await Promise.all([
    supabase
      .from('rooms')
      .select('id, room_number, room_type')
      .eq('property_id', hotelUser.propertyId)
      .order('room_number'),
    supabase
      .from('qr_codes')
      .select('room_id')
      .eq('property_id', hotelUser.propertyId)
      .eq('type', 'room')
      .eq('is_active', true),
  ])

  const activeRoomIds = new Set((roomQrs ?? []).map(qr => qr.room_id))
  const roomsWithActiveQr = (rooms ?? []).filter(room => activeRoomIds.has(room.id))
  const skippedCount = (rooms ?? []).length - roomsWithActiveQr.length

  const roomsWithImage = await Promise.all(
    roomsWithActiveQr.map(async room => ({
      id: room.id,
      roomNumber: room.room_number,
      roomType: room.room_type,
      image: await generateQRImage(`${process.env.NEXT_PUBLIC_APP_URL}/api/scan/room?room_id=${room.id}`),
    }))
  )

  return (
    <RequirePermission role={hotelUser.role} resource="qr_sessions" level="read">
      <main className="mx-auto max-w-4xl p-6 print:max-w-none print:p-0">
        <h1 className="mb-6 text-2xl font-semibold print:hidden">{t('print.title')}</h1>
        <PrintRoomQrList rooms={roomsWithImage} skippedCount={skippedCount} />
      </main>
    </RequirePermission>
  )
}
