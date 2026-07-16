'use server'

import { getHotelUser } from '@/lib/panel/auth'
import { canPerform } from '@/lib/panel/rbac'
import { generateReceptionQR, DpaNotSignedError } from '@/lib/qr/generate'
import { generateQRImage } from '@/lib/qr/image'
import { getActiveReceptionQr } from '@/lib/qr/query'

const ROTATE_THRESHOLD_MS = 60 * 1000

type EnsureFreshResult =
  | { rotated: true; id: string; expiresAt: string; image: string }
  | { rotated: false }
  | { error: string }

export async function ensureReceptionQRFresh(): Promise<EnsureFreshResult> {
  const hotelUser = await getHotelUser()
  if (!hotelUser) return { error: 'unauthorized' }
  if (!canPerform(hotelUser.role, 'qr_sessions', 'read')) return { error: 'forbidden' }

  const current = await getActiveReceptionQr(hotelUser.propertyId)
  const remainingMs = current?.expiresAt ? new Date(current.expiresAt).getTime() - Date.now() : -1

  if (current && remainingMs > ROTATE_THRESHOLD_MS) {
    return { rotated: false }
  }

  try {
    const fresh = await generateReceptionQR(hotelUser.propertyId)
    const image = await generateQRImage(
      `${process.env.NEXT_PUBLIC_APP_URL}/api/scan/reception?init_token=${fresh.init_token}`
    )
    return { rotated: true, id: fresh.id, expiresAt: fresh.expires_at!, image }
  } catch (e) {
    if (e instanceof DpaNotSignedError) return { error: 'dpaNotSigned' }
    throw e
  }
}
