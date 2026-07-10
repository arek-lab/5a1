import { describe, it, expect } from 'vitest'
import { isRoomScanUrl } from '../room-scan-url'

const ORIGIN = 'https://guest.example.com'

describe('isRoomScanUrl', () => {
  it('accepts a same-origin room scan URL with room_id', () => {
    expect(isRoomScanUrl(`${ORIGIN}/api/scan/room?room_id=abc-123`, ORIGIN)).toBe(true)
  })

  it('rejects a foreign origin', () => {
    expect(isRoomScanUrl('https://evil.example.com/api/scan/room?room_id=abc-123', ORIGIN)).toBe(false)
  })

  it('rejects a different path', () => {
    expect(isRoomScanUrl(`${ORIGIN}/api/scan/reception?room_id=abc-123`, ORIGIN)).toBe(false)
  })

  it('rejects a missing room_id', () => {
    expect(isRoomScanUrl(`${ORIGIN}/api/scan/room`, ORIGIN)).toBe(false)
  })

  it('rejects an empty room_id', () => {
    expect(isRoomScanUrl(`${ORIGIN}/api/scan/room?room_id=`, ORIGIN)).toBe(false)
  })

  it('rejects a non-URL string', () => {
    expect(isRoomScanUrl('not a url', ORIGIN)).toBe(false)
  })
})
