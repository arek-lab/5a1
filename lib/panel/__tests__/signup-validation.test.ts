import { describe, it, expect } from 'vitest'
import { validateHotelName } from '../signup-validation'

describe('validateHotelName', () => {
  it('accepts a valid name', () => {
    const result = validateHotelName('Hotel Bałtyk')
    expect(result).toEqual({ ok: true, value: 'Hotel Bałtyk' })
  })

  it('trims surrounding whitespace', () => {
    const result = validateHotelName('  Hotel Bałtyk  ')
    expect(result).toEqual({ ok: true, value: 'Hotel Bałtyk' })
  })

  it('rejects an empty name', () => {
    const result = validateHotelName('')
    expect(result).toEqual({ ok: false, error: 'invalid_hotel_name' })
  })

  it('rejects a whitespace-only name', () => {
    const result = validateHotelName('   ')
    expect(result).toEqual({ ok: false, error: 'invalid_hotel_name' })
  })

  it('rejects a name over the max length', () => {
    const result = validateHotelName('a'.repeat(201))
    expect(result).toEqual({ ok: false, error: 'invalid_hotel_name' })
  })

  it('accepts a name at the max length', () => {
    const result = validateHotelName('a'.repeat(200))
    expect(result.ok).toBe(true)
  })
})
