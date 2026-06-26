import type { Tables } from '@/lib/supabase/database.types'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { RoomScanError } from './errors'

export async function validateRoomScan(params: {
  sessionId: string
  roomId: string
}): Promise<
  | { ok: true; session: Tables<'sessions'>; room: Tables<'rooms'>; reservation: Tables<'reservations'> }
  | { ok: false; error: RoomScanError }
> {
  const supabase = createServiceRoleClient()

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', params.sessionId)
    .single()

  if (sessionError || !session) return { ok: false, error: 'session_not_found' }
  if (session.revoked) return { ok: false, error: 'session_revoked' }
  if (new Date(session.expires_at) <= new Date()) return { ok: false, error: 'session_expired' }
  if (session.auth_level !== 1) return { ok: false, error: 'wrong_auth_level' }

  const { data: qrCode, error: qrError } = await supabase
    .from('qr_codes')
    .select('*')
    .eq('room_id', params.roomId)
    .eq('type', 'room')
    .eq('is_active', true)
    .eq('property_id', session.property_id)
    .single()

  if (qrError || !qrCode) return { ok: false, error: 'room_qr_not_found' }

  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', params.roomId)
    .eq('property_id', session.property_id)
    .single()

  if (roomError || !room) return { ok: false, error: 'room_qr_not_found' }

  const now = new Date()
  if (
    room.valid_from === null ||
    room.valid_until === null ||
    now < new Date(room.valid_from) ||
    now > new Date(room.valid_until)
  ) {
    return { ok: false, error: 'outside_window' }
  }

  if (room.room_active_reservation_id === null) {
    return { ok: false, error: 'no_active_reservation' }
  }

  const { data: reservation, error: reservationError } = await supabase
    .from('reservations')
    .select('*')
    .eq('id', room.room_active_reservation_id)
    .single()

  if (reservationError || !reservation) return { ok: false, error: 'no_active_reservation' }

  return { ok: true, session, room, reservation }
}

export async function upgradeSession(params: {
  sessionId: string
  roomId: string
  reservationId: string
  checkOut: string
}): Promise<void> {
  const supabase = createServiceRoleClient()

  const expiresAt = new Date(new Date(params.checkOut).getTime() + 2 * 60 * 60 * 1000).toISOString()

  const { error } = await supabase
    .from('sessions')
    .update({
      auth_level: 2,
      room_id: params.roomId,
      room_scan_at: new Date().toISOString(),
      reservation_id: params.reservationId,
      expires_at: expiresAt,
    })
    .eq('id', params.sessionId)

  if (error) throw error
}
