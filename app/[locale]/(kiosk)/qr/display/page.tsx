import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createServerClient } from '@/lib/supabase/server'
import { getHotelUser } from '@/lib/panel/auth'
import { generateQRImage } from '@/lib/qr/image'
import { getActiveReceptionQr } from '@/lib/qr/query'
import RequirePermission from '@/components/panel/require-permission'
import ReceptionQrKiosk from './reception-qr-kiosk'

export default async function QrDisplayPage() {
  const hotelUser = await getHotelUser()
  if (!hotelUser) redirect('/login')

  const supabase = await createServerClient()
  const t = await getTranslations('qr')

  const { data: property } = await supabase
    .from('properties')
    .select('name, dpa_signed_at')
    .eq('id', hotelUser.propertyId)
    .single()

  if (!property?.dpa_signed_at) {
    return (
      <RequirePermission role={hotelUser.role} resource="qr_sessions" level="read">
        <main className="flex h-screen w-screen items-center justify-center p-8 text-center">
          <p className="text-lg text-panel-ink-muted">{t('dpaBlocked.message')}</p>
        </main>
      </RequirePermission>
    )
  }

  const receptionQr = await getActiveReceptionQr(hotelUser.propertyId)
  const image = receptionQr
    ? await generateQRImage(
        `${process.env.NEXT_PUBLIC_APP_URL}/api/scan/reception?init_token=${receptionQr.initToken}`
      )
    : null

  return (
    <RequirePermission role={hotelUser.role} resource="qr_sessions" level="read">
      <ReceptionQrKiosk
        hotelName={property.name}
        initial={
          receptionQr && image
            ? { id: receptionQr.id, expiresAt: receptionQr.expiresAt, image }
            : { id: null, expiresAt: null, image: null }
        }
      />
    </RequirePermission>
  )
}
