'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { ensureReceptionQRFresh } from './actions'

type QrState = {
  id: string | null
  expiresAt: string | null
  image: string | null
}

interface Props {
  hotelName: string
  initial: QrState
}

const POLL_INTERVAL_MS = 15 * 1000
const REFRESHING_POLL_INTERVAL_MS = 3 * 1000
const ROTATE_THRESHOLD_MS = 60 * 1000
const MAX_JITTER_MS = 4 * 1000

function formatCountdown(expiresAt: string | null, clockOffsetMs: number): string {
  if (!expiresAt) return '--:--'
  const remainingMs = new Date(expiresAt).getTime() - (Date.now() + clockOffsetMs)
  if (remainingMs <= 0) return '00:00'
  const totalSeconds = Math.floor(remainingMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export default function ReceptionQrKiosk({ hotelName, initial }: Props) {
  const t = useTranslations('qr')
  const [state, setState] = useState<QrState>(initial)
  const [clockOffsetMs, setClockOffsetMs] = useState(0)
  const [countdown, setCountdown] = useState(() => formatCountdown(initial.expiresAt, 0))
  const [, startTransition] = useTransition()
  const attemptedRotateForId = useRef<string | null>(null)
  const pollIntervalRef = useRef(POLL_INTERVAL_MS)

  useEffect(() => {
    const tick = setInterval(() => {
      setCountdown(formatCountdown(state.expiresAt, clockOffsetMs))
    }, 1000)
    return () => clearInterval(tick)
  }, [state.expiresAt, clockOffsetMs])

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>

    async function poll() {
      try {
        const res = await fetch('/api/panel/qr/reception', { cache: 'no-store' })
        if (res.ok) {
          const data = await res.json()
          if (!cancelled) {
            setClockOffsetMs(new Date(data.serverNow).getTime() - Date.now())
            setState(prev => {
              if (data.id !== prev.id) {
                attemptedRotateForId.current = null
                pollIntervalRef.current = POLL_INTERVAL_MS
                return { id: data.id, expiresAt: data.expiresAt, image: data.image }
              }
              return prev
            })
          }
        }
      } catch {
        // network blip — next poll retries
      }
      if (!cancelled) {
        timer = setTimeout(poll, pollIntervalRef.current)
      }
    }

    timer = setTimeout(poll, pollIntervalRef.current)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    const remainingMs = state.expiresAt
      ? new Date(state.expiresAt).getTime() - (Date.now() + clockOffsetMs)
      : -1

    if (remainingMs > ROTATE_THRESHOLD_MS) return
    if (attemptedRotateForId.current === state.id) return

    attemptedRotateForId.current = state.id
    const jitter = Math.random() * MAX_JITTER_MS
    pollIntervalRef.current = REFRESHING_POLL_INTERVAL_MS

    const jitterTimer = setTimeout(() => {
      startTransition(async () => {
        const result = await ensureReceptionQRFresh()
        if ('rotated' in result && result.rotated) {
          pollIntervalRef.current = POLL_INTERVAL_MS
          setState({ id: result.id, expiresAt: result.expiresAt, image: result.image })
        }
      })
    }, jitter)

    return () => clearTimeout(jitterTimer)
  }, [state.id, state.expiresAt, clockOffsetMs])

  const isRefreshing = countdown === '00:00'

  return (
    <main className="flex h-screen w-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-2xl font-semibold text-panel-ink">{hotelName}</h1>
      {state.image ? (
        <div
          className="mx-auto flex items-center justify-center"
          style={{ width: 'min(70vh, 70vw)', height: 'min(70vh, 70vw)' }}
          dangerouslySetInnerHTML={{ __html: state.image }}
        />
      ) : (
        <div className="flex items-center justify-center" style={{ width: 'min(70vh, 70vw)', height: 'min(70vh, 70vw)' }}>
          <p className="text-lg text-panel-ink-muted">{t('kiosk.unavailable')}</p>
        </div>
      )}
      {state.image && (
        <>
          {isRefreshing ? (
            <p className="text-base text-panel-ink-muted">{t('kiosk.refreshing')}</p>
          ) : (
            <p className="text-xl text-panel-ink">{t('kiosk.instruction')}</p>
          )}
          <p className="font-mono text-sm text-panel-ink-muted">
            {t('reception.countdown')}: {countdown}
          </p>
        </>
      )}
    </main>
  )
}
