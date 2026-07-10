export function isRoomScanUrl(decoded: string, currentOrigin: string): boolean {
  let url: URL
  try {
    url = new URL(decoded)
  } catch {
    return false
  }

  return (
    url.origin === currentOrigin &&
    url.pathname === '/api/scan/room' &&
    (url.searchParams.get('room_id')?.length ?? 0) > 0
  )
}
