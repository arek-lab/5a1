'use client'

import { useEffect, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import {
  rotateReceptionQR,
  activateRoomQR,
  deactivateRoomQR,
  checkInRoomAction,
  updateCheckOutAction,
} from './actions'

export type RoomWithQr = {
  id: string
  roomNumber: string
  roomType: string | null
  activeQr: { id: string } | null
  activeReservation: { id: string; checkOut: string } | null
}

type ReceptionQr = {
  id: string
  expiresAt: string | null
  image: string | null
}

interface Props {
  receptionQr: ReceptionQr | null
  rooms: RoomWithQr[]
  sessionCount: number
  canEdit: boolean
}

const AUTO_ROTATE_INTERVAL_MS = 5 * 60 * 1000

const rowButtonClass =
  'rounded border px-2 py-1 text-sm hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50'
const toolbarButtonClass =
  'rounded border px-3 py-1.5 text-sm font-medium hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50'

function statusBadgeClass(variant: 'active' | 'inactive') {
  return variant === 'active'
    ? 'rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800'
    : 'rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600'
}

function toDatetimeLocalValue(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatCheckOut(iso: string): string {
  return new Date(iso).toLocaleString()
}

function formatCountdown(expiresAt: string | null): string {
  if (!expiresAt) return '--:--'
  const remainingMs = new Date(expiresAt).getTime() - Date.now()
  if (remainingMs <= 0) return '00:00'
  const totalSeconds = Math.floor(remainingMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export default function QrPanel({ receptionQr, rooms, sessionCount, canEdit }: Props) {
  const t = useTranslations('qr')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [countdown, setCountdown] = useState(() => formatCountdown(receptionQr?.expiresAt ?? null))
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null)
  const [checkOutInput, setCheckOutInput] = useState('')

  useEffect(() => {
    const tick = setInterval(() => setCountdown(formatCountdown(receptionQr?.expiresAt ?? null)), 1000)
    return () => clearInterval(tick)
  }, [receptionQr?.expiresAt])

  useEffect(() => {
    const rotate = setInterval(() => {
      startTransition(async () => {
        const result = await rotateReceptionQR()
        if (result.error) setError(result.error)
      })
    }, AUTO_ROTATE_INTERVAL_MS)
    return () => clearInterval(rotate)
  }, [])

  function handleManualRotate() {
    setError(null)
    startTransition(async () => {
      const result = await rotateReceptionQR()
      if (result.error) setError(result.error)
    })
  }

  function handleToggleRoom(room: RoomWithQr) {
    setError(null)
    startTransition(async () => {
      const result = room.activeQr
        ? await deactivateRoomQR(room.id)
        : await activateRoomQR(room.id)
      if (result.error) setError(result.error)
    })
  }

  function openReservationForm(room: RoomWithQr) {
    setError(null)
    setEditingRoomId(room.id)
    setCheckOutInput(room.activeReservation ? toDatetimeLocalValue(room.activeReservation.checkOut) : '')
  }

  function closeReservationForm() {
    setEditingRoomId(null)
    setCheckOutInput('')
  }

  function handleReservationSubmit(room: RoomWithQr) {
    setError(null)
    const checkOutIso = new Date(checkOutInput).toISOString()
    startTransition(async () => {
      const result = room.activeReservation
        ? await updateCheckOutAction(room.activeReservation.id, checkOutIso)
        : await checkInRoomAction(room.id, checkOutIso)
      if (result.error) {
        setError(result.error)
        return
      }
      closeReservationForm()
    })
  }

  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {t(`errors.${error}`)}
        </p>
      )}

      <section className="rounded border p-4">
        <h2 className="mb-3 text-lg font-semibold">{t('reception.title')}</h2>
        {receptionQr?.image ? (
          <div className="flex flex-wrap items-start gap-6">
            <div
              className="h-40 w-40 shrink-0"
              dangerouslySetInnerHTML={{ __html: receptionQr.image }}
            />
            <div className="space-y-2">
              <p className="text-sm text-gray-600">
                {t('reception.countdown')}: <span className="font-mono">{countdown}</span>
              </p>
              <p className="text-sm text-gray-600">
                {t('reception.sessionCount')}: <span className="font-medium">{sessionCount}</span>
              </p>
              {canEdit && (
                <button
                  type="button"
                  className={toolbarButtonClass}
                  disabled={isPending}
                  onClick={handleManualRotate}
                >
                  {t('reception.rotateNow')}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="italic text-gray-500">{t('reception.empty')}</p>
            {canEdit && (
              <button
                type="button"
                className={toolbarButtonClass}
                disabled={isPending}
                onClick={handleManualRotate}
              >
                {t('reception.rotateNow')}
              </button>
            )}
          </div>
        )}
      </section>

      <section className="rounded border p-4">
        <h2 className="mb-3 text-lg font-semibold">{t('rooms.title')}</h2>
        {rooms.length === 0 ? (
          <p className="italic text-gray-500">{t('rooms.empty')}</p>
        ) : (
          <ul className="divide-y rounded border">
            {rooms.map(room => (
              <li key={room.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{room.roomNumber}</span>
                  {room.roomType && <span className="text-sm text-gray-500">{room.roomType}</span>}
                  <span className={statusBadgeClass(room.activeQr ? 'active' : 'inactive')}>
                    {room.activeQr ? t('rooms.activeLabel') : t('rooms.inactiveLabel')}
                  </span>
                  {room.activeReservation && (
                    <span className="text-sm text-gray-500">
                      {t('rooms.checkOutLabel')}: {formatCheckOut(room.activeReservation.checkOut)}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {canEdit && (
                    <button
                      type="button"
                      className={rowButtonClass}
                      disabled={isPending}
                      onClick={() => handleToggleRoom(room)}
                    >
                      {room.activeQr ? t('rooms.deactivate') : t('rooms.activate')}
                    </button>
                  )}
                  {canEdit && editingRoomId !== room.id && (
                    <button
                      type="button"
                      className={rowButtonClass}
                      disabled={isPending}
                      onClick={() => openReservationForm(room)}
                    >
                      {room.activeReservation ? t('rooms.editCheckOut') : t('rooms.checkIn')}
                    </button>
                  )}
                </div>
                {canEdit && editingRoomId === room.id && (
                  <form
                    className="flex w-full flex-wrap items-center gap-2 pt-2"
                    onSubmit={e => {
                      e.preventDefault()
                      handleReservationSubmit(room)
                    }}
                  >
                    <input
                      type="datetime-local"
                      required
                      value={checkOutInput}
                      onChange={e => setCheckOutInput(e.target.value)}
                      className="rounded border px-2 py-1 text-sm"
                    />
                    <button type="submit" className={rowButtonClass} disabled={isPending}>
                      {t('rooms.confirm')}
                    </button>
                    <button
                      type="button"
                      className={rowButtonClass}
                      disabled={isPending}
                      onClick={closeReservationForm}
                    >
                      {t('rooms.cancel')}
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
