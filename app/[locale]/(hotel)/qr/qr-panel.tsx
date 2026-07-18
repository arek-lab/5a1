'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import {
  rotateReceptionQR,
  activateRoomQR,
  deactivateRoomQR,
  checkInRoomAction,
  updateCheckOutAction,
  createRoomAction,
} from './actions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useNowSeconds } from '@/lib/panel/use-now-seconds'

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
  canManageRooms: boolean
  locale: string
  timeZone: string
}

const AUTO_ROTATE_INTERVAL_MS = 5 * 60 * 1000

function toDatetimeLocalValue(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatCheckOut(iso: string, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(
    new Date(iso)
  )
}

function formatCountdown(expiresAt: string | null, nowMs: number | null): string {
  if (!expiresAt || nowMs === null) return '--:--'
  const remainingMs = new Date(expiresAt).getTime() - nowMs
  if (remainingMs <= 0) return '00:00'
  const totalSeconds = Math.floor(remainingMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export default function QrPanel({ receptionQr, rooms, sessionCount, canEdit, canManageRooms, locale, timeZone }: Props) {
  const t = useTranslations('qr')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null)
  const [checkOutInput, setCheckOutInput] = useState('')
  const [isAddingRoom, setIsAddingRoom] = useState(false)
  const [newRoomNumber, setNewRoomNumber] = useState('')
  const [newRoomType, setNewRoomType] = useState('')

  const nowSeconds = useNowSeconds()
  const countdown = formatCountdown(
    receptionQr?.expiresAt ?? null,
    nowSeconds === null ? null : nowSeconds * 1000
  )

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

  function openAddRoomForm() {
    setError(null)
    setIsAddingRoom(true)
    setNewRoomNumber('')
    setNewRoomType('')
  }

  function closeAddRoomForm() {
    setIsAddingRoom(false)
    setNewRoomNumber('')
    setNewRoomType('')
  }

  function handleAddRoomSubmit() {
    setError(null)
    startTransition(async () => {
      const result = await createRoomAction(newRoomNumber, newRoomType.trim() || null)
      if (result.error) {
        setError(result.error)
        return
      }
      closeAddRoomForm()
    })
  }

  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(`errors.${error}`)}
        </p>
      )}

      <section className="rounded-md border border-border bg-panel-surface p-4">
        <h2 className="mb-3 text-lg font-semibold">{t('reception.title')}</h2>
        {receptionQr?.image ? (
          <div className="flex flex-wrap items-start gap-6">
            <div
              className="h-40 w-40 shrink-0"
              dangerouslySetInnerHTML={{ __html: receptionQr.image }}
            />
            <div className="space-y-2">
              <p className="text-sm text-panel-ink-muted">
                {t('reception.countdown')}: <span className="font-mono">{countdown}</span>
              </p>
              <p className="text-sm text-panel-ink-muted">
                {t('reception.sessionCount')}: <span className="font-mono">{sessionCount}</span>
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {canEdit && (
                  <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={handleManualRotate}>
                    {t('reception.rotateNow')}
                  </Button>
                )}
                <Button asChild variant="outline" size="sm">
                  <Link href="/qr/display" target="_blank" rel="noopener noreferrer">
                    {t('reception.openDisplay')}
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="italic text-panel-ink-muted">{t('reception.empty')}</p>
            <div className="flex flex-wrap items-center gap-2">
              {canEdit && (
                <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={handleManualRotate}>
                  {t('reception.rotateNow')}
                </Button>
              )}
              <Button asChild variant="outline" size="sm">
                <Link href="/qr/display" target="_blank" rel="noopener noreferrer">
                  {t('reception.openDisplay')}
                </Link>
              </Button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-md border border-border bg-panel-surface p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t('rooms.title')}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/qr/print">{t('rooms.printLink')}</Link>
            </Button>
            {canManageRooms && !isAddingRoom && (
              <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={openAddRoomForm}>
                {t('rooms.addRoom')}
              </Button>
            )}
          </div>
        </div>

        {canManageRooms && isAddingRoom && (
          <form
            className="mb-4 flex flex-wrap items-end gap-2 rounded-md border border-border p-3"
            onSubmit={e => {
              e.preventDefault()
              handleAddRoomSubmit()
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="new-room-number">{t('rooms.roomNumberLabel')}</Label>
              <Input
                id="new-room-number"
                type="text"
                required
                value={newRoomNumber}
                onChange={e => setNewRoomNumber(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-room-type">{t('rooms.roomTypeLabel')}</Label>
              <Input
                id="new-room-type"
                type="text"
                value={newRoomType}
                onChange={e => setNewRoomType(e.target.value)}
              />
            </div>
            <Button type="submit" variant="outline" size="sm" disabled={isPending}>
              {t('rooms.confirm')}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={closeAddRoomForm}>
              {t('rooms.cancel')}
            </Button>
          </form>
        )}

        {rooms.length === 0 ? (
          <p className="italic text-panel-ink-muted">{t('rooms.empty')}</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {rooms.map(room => (
              <li key={room.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{room.roomNumber}</span>
                  {room.roomType && <span className="text-sm text-panel-ink-muted">{room.roomType}</span>}
                  <Badge variant={room.activeQr ? 'default' : 'secondary'}>
                    {room.activeQr ? t('rooms.activeLabel') : t('rooms.inactiveLabel')}
                  </Badge>
                  {room.activeReservation && (
                    <span className="text-sm text-panel-ink-muted">
                      {t('rooms.checkOutLabel')}: {formatCheckOut(room.activeReservation.checkOut, locale, timeZone)}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {canEdit && (
                    <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => handleToggleRoom(room)}>
                      {room.activeQr ? t('rooms.deactivate') : t('rooms.activate')}
                    </Button>
                  )}
                  {canEdit && editingRoomId !== room.id && (
                    <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => openReservationForm(room)}>
                      {room.activeReservation ? t('rooms.editCheckOut') : t('rooms.checkIn')}
                    </Button>
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
                    <Input
                      type="datetime-local"
                      required
                      value={checkOutInput}
                      onChange={e => setCheckOutInput(e.target.value)}
                      className="w-auto"
                    />
                    <Button type="submit" variant="outline" size="sm" disabled={isPending}>
                      {t('rooms.confirm')}
                    </Button>
                    <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={closeReservationForm}>
                      {t('rooms.cancel')}
                    </Button>
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
