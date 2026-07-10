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
import {
  checkInRoom,
  RoomNotFoundError,
  RoomOccupiedError,
  InvalidCheckOutError,
} from '@/lib/reservations/check-in'
import {
  updateReservationCheckOut,
  ReservationNotFoundError,
} from '@/lib/reservations/update-checkout'

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

export async function checkInRoomAction(roomId: string, checkOut: string): Promise<ActionResult> {
  const hotelUser = await requireQrWriteAccess()
  if (!hotelUser) return { error: 'forbidden' }

  try {
    await checkInRoom(hotelUser.propertyId, roomId, checkOut)
  } catch (e) {
    if (e instanceof DpaNotSignedError) return { error: 'dpaNotSigned' }
    if (e instanceof RoomOccupiedError) return { error: 'roomOccupied' }
    if (e instanceof InvalidCheckOutError) return { error: 'invalidCheckOut' }
    if (e instanceof RoomNotFoundError) return { error: 'notFound' }
    throw e
  }

  revalidatePath('/qr')
  return {}
}

export async function updateCheckOutAction(
  reservationId: string,
  checkOut: string
): Promise<ActionResult> {
  const hotelUser = await requireQrWriteAccess()
  if (!hotelUser) return { error: 'forbidden' }

  try {
    await updateReservationCheckOut(hotelUser.propertyId, reservationId, checkOut)
  } catch (e) {
    if (e instanceof DpaNotSignedError) return { error: 'dpaNotSigned' }
    if (e instanceof InvalidCheckOutError) return { error: 'invalidCheckOut' }
    if (e instanceof ReservationNotFoundError) return { error: 'notFound' }
    throw e
  }

  revalidatePath('/qr')
  return {}
}
