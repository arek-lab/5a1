import type { Tables } from '@/lib/supabase/database.types'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export class InvalidRoomNumberError extends Error {
  constructor() {
    super('Room number must not be empty')
    this.name = 'InvalidRoomNumberError'
  }
}

export class RoomNumberTakenError extends Error {
  constructor(roomNumber: string) {
    super(`Room number already exists in this property: ${roomNumber}`)
    this.name = 'RoomNumberTakenError'
  }
}

export async function createRoom(
  propertyId: string,
  roomNumber: string,
  roomType: string | null
): Promise<Tables<'rooms'>> {
  const trimmedNumber = roomNumber.trim()
  if (!trimmedNumber) throw new InvalidRoomNumberError()

  const supabase = createServiceRoleClient()

  const { data, error } = await supabase
    .from('rooms')
    .insert({
      property_id: propertyId,
      room_number: trimmedNumber,
      room_type: roomType,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') throw new RoomNumberTakenError(trimmedNumber)
    throw error
  }

  return data
}
