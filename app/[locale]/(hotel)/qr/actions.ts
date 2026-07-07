'use server'

import { revalidatePath } from 'next/cache'
import { getHotelUser, type HotelUser } from '@/lib/panel/auth'
import { canPerform } from '@/lib/panel/rbac'
import {
  generateReceptionQR,
  generateRoomQR,
  deactivateRoomQR as deactivateRoomQRLib,
  DpaNotSignedError,
} from '@/lib/qr/generate'

type ActionResult = { error?: string }

async function requireQrWriteAccess(): Promise<HotelUser | null> {
  const hotelUser = await getHotelUser()
  if (!hotelUser || !canPerform(hotelUser.role, 'qr_manage', 'write')) {
    return null
  }
  return hotelUser
}

export async function rotateReceptionQR(): Promise<ActionResult> {
  const hotelUser = await requireQrWriteAccess()
  if (!hotelUser) return { error: 'forbidden' }

  try {
    await generateReceptionQR(hotelUser.propertyId)
  } catch (e) {
    if (e instanceof DpaNotSignedError) return { error: 'dpaNotSigned' }
    throw e
  }

  revalidatePath('/qr')
  return {}
}

export async function activateRoomQR(roomId: string): Promise<ActionResult> {
  const hotelUser = await requireQrWriteAccess()
  if (!hotelUser) return { error: 'forbidden' }

  try {
    await generateRoomQR(hotelUser.propertyId, roomId)
  } catch (e) {
    if (e instanceof DpaNotSignedError) return { error: 'dpaNotSigned' }
    throw e
  }

  revalidatePath('/qr')
  return {}
}

export async function deactivateRoomQR(roomId: string): Promise<ActionResult> {
  const hotelUser = await requireQrWriteAccess()
  if (!hotelUser) return { error: 'forbidden' }

  await deactivateRoomQRLib(hotelUser.propertyId, roomId)

  revalidatePath('/qr')
  return {}
}
