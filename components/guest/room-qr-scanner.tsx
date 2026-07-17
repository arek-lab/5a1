'use client'

import { useEffect, useRef, useState } from 'react'
import QrScanner from 'qr-scanner'
import { isRoomScanUrl } from '@/lib/guest/room-scan-url'

export function RoomQrScanner() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const scannerRef = useRef<QrScanner | null>(null)
  const matchedRef = useRef(false)
  const [rejectionMessage, setRejectionMessage] = useState<string | null>(null)
  const [cameraError, setCameraError] = useState(false)

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('retry')) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- location.search is unreadable during SSR; this syncs one-time banner visibility after mount
      setRejectionMessage('Nie udało się połączyć z pokojem. Spróbuj zeskanować ponownie.')
      window.history.replaceState(null, '', '/scan')
    }
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const scanner = new QrScanner(
      video,
      (result) => {
        if (matchedRef.current) return
        if (isRoomScanUrl(result.data, window.location.origin)) {
          matchedRef.current = true
          scanner.stop()
          window.location.href = result.data
          return
        }
        setRejectionMessage('To nie jest kod pokoju z tego hotelu, spróbuj ponownie')
      },
      { highlightScanRegion: true, highlightCodeOutline: true }
    )
    scannerRef.current = scanner

    scanner.start().catch(() => setCameraError(true))

    return () => {
      scanner.stop()
      scanner.destroy()
      scannerRef.current = null
    }
  }, [])

  if (cameraError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-guest-stone px-4 text-center">
        <p className="text-guest-ink">Nie można uzyskać dostępu do aparatu</p>
        <p className="text-sm text-guest-ink-muted">Poproś o pomoc w recepcji</p>
      </div>
    )
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-black">
      <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
      {rejectionMessage && (
        <p className="absolute bottom-8 left-4 right-4 rounded-card bg-guest-paper/90 px-4 py-2 text-center text-sm text-guest-ink">
          {rejectionMessage}
        </p>
      )}
    </div>
  )
}
