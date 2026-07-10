import type { Tables } from '@/lib/supabase/database.types'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { checkDpa } from '@/lib/qr/generate'

export class RoomNotFoundError extends Error {
  constructor(roomId: string) {
    super(`Room not found: ${roomId}`)
    this.name = 'RoomNotFoundError'
  }
}

export class RoomOccupiedError extends Error {
  constructor(roomId: string) {
    super(`Room already has an active reservation: ${roomId}`)
    this.name = 'RoomOccupiedError'
  }
}

export class InvalidCheckOutError extends Error {
  constructor(checkOut: string) {
    super(`Invalid check-out date: ${checkOut}`)
    this.name = 'InvalidCheckOutError'
  }
}

export async function checkInRoom(
  propertyId: string,
  roomId: string,
  checkOut: string
): Promise<Tables<'reservations'>> {
  await checkDpa(propertyId)

  const supabase = createServiceRoleClient()

  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select('room_active_reservation_id')
    .eq('id', roomId)
    .eq('property_id', propertyId)
    .single()

  if (roomError || !room) throw new RoomNotFoundError(roomId)
  if (room.room_active_reservation_id !== null) throw new RoomOccupiedError(roomId)

  if (!(new Date(checkOut) > new Date())) throw new InvalidCheckOutError(checkOut)

  const checkIn = new Date().toISOString()

  const { data: reservation, error: insertError } = await supabase
    .from('reservations')
    .insert({
      property_id: propertyId,
      room_id: roomId,
      check_in: checkIn,
      check_out: checkOut,
      status: 'checked_in',
      source: 'direct',
      guest_first_name: null,
    })
    .select()
    .single()

  if (insertError) throw insertError

  const { error: updateError } = await supabase
    .from('rooms')
    .update({
      room_active_reservation_id: reservation.id,
      valid_from: checkIn,
      valid_until: checkOut,
    })
    .eq('id', roomId)

  if (updateError) throw updateError

  const { error: auditError } = await supabase.from('audit_logs').insert({
    property_id: propertyId,
    event_type: 'reservation_check_in',
    target_id: reservation.id,
    metadata: { room_id: roomId, check_out: checkOut },
  })

  if (auditError) throw auditError

  return reservation
}
