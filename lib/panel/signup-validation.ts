export type SignupValidationResult =
  | { ok: true; value: string }
  | { ok: false; error: string }

const MAX_HOTEL_NAME_LENGTH = 200

export function validateHotelName(hotelName: string): SignupValidationResult {
  const name = hotelName.trim()
  if (!name) {
    return { ok: false, error: 'invalid_hotel_name' }
  }
  if (name.length > MAX_HOTEL_NAME_LENGTH) {
    return { ok: false, error: 'invalid_hotel_name' }
  }
  return { ok: true, value: name }
}
