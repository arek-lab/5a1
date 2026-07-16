import { NextResponse } from 'next/server'
import { getHotelUser } from '@/lib/panel/auth'
import { canPerform } from '@/lib/panel/rbac'
import { generateQRImage } from '@/lib/qr/image'
import { getActiveReceptionQr } from '@/lib/qr/query'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<NextResponse> {
  const hotelUser = await getHotelUser()
  if (!hotelUser) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!canPerform(hotelUser.role, 'qr_sessions', 'read')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const serverNow = new Date().toISOString()
  const receptionQr = await getActiveReceptionQr(hotelUser.propertyId)

  if (!receptionQr) {
    return NextResponse.json({ id: null, expiresAt: null, image: null, serverNow })
  }

  const image = await generateQRImage(
    `${process.env.NEXT_PUBLIC_APP_URL}/api/scan/reception?init_token=${receptionQr.initToken}`
  )

  return NextResponse.json({
    id: receptionQr.id,
    expiresAt: receptionQr.expiresAt,
    image,
    serverNow,
  })
}
