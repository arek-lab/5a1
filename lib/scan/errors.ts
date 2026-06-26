export type ReceptionScanError = 'token_not_found' | 'token_expired' | 'token_used'

export type RoomScanError =
  | 'missing_session_cookie'
  | 'session_not_found'
  | 'session_expired'
  | 'session_revoked'
  | 'wrong_auth_level'
  | 'room_qr_not_found'
  | 'outside_window'
  | 'no_active_reservation'
