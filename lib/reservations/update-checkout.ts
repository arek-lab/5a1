import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { checkDpa } from '@/lib/qr/generate'
import { InvalidCheckOutError } from '@/lib/reservations/check-in'

export class ReservationNotFoundError extends Error {
  constructor(reservationId: string) {
    super(`Reservation not found: ${reservationId}`)
    this.name = 'ReservationNotFoundError'
  }
}

export async function updateReservationCheckOut(
  propertyId: string,
  reservationId: string,
  newCheckOut: string
): Promise<void> {
  await checkDpa(propertyId)

  const supabase = createServiceRoleClient()

  const { data: reservation, error: reservationError } = await supabase
    .from('reservations')
    .select('id, room_id, check_out')
    .eq('id', reservationId)
    .eq('property_id', propertyId)
    .single()

  if (reservationError || !reservation) throw new ReservationNotFoundError(reservationId)

  if (!(new Date(newCheckOut) > new Date())) throw new InvalidCheckOutError(newCheckOut)

  const { error: updateError } = await supabase
    .from('reservations')
    .update({ check_out: newCheckOut })
    .eq('id', reservationId)

  if (updateError) throw updateError

  if (reservation.room_id !== null) {
    const { error: roomError } = await supabase
      .from('rooms')
      .update({ valid_until: newCheckOut })
      .eq('id', reservation.room_id)
      .eq('room_active_reservation_id', reservationId)

    if (roomError) throw roomError
  }

  const expiresAt = new Date(new Date(newCheckOut).getTime() + 2 * 60 * 60 * 1000).toISOString()

  const { error: sessionsError } = await supabase
    .from('sessions')
    .update({ expires_at: expiresAt })
    .eq('reservation_id', reservationId)
    .eq('revoked', false)
    .eq('auth_level', 2)

  if (sessionsError) throw sessionsError

  const { error: auditError } = await supabase.from('audit_logs').insert({
    property_id: propertyId,
    event_type: 'reservation_checkout_edit',
    target_id: reservationId,
    metadata: { old_check_out: reservation.check_out, new_check_out: newCheckOut },
  })

  if (auditError) throw auditError
}
