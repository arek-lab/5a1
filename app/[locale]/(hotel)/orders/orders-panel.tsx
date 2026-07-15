'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { updateOrderStatus } from './actions'
import { ALLOWED_TRANSITIONS, type OrderStatus } from '@/lib/orders/status'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export type OrderRecord = {
  id: string
  status: OrderStatus
  priceCents: number | null
  note: string | null
  createdAt: string
  roomNumber: string | null
  serviceName: string
}

export type RoomOption = { id: string; room_number: string }
export type ServiceOption = { id: string; name: string }

type SseOrderPayload = {
  id: string
  status: OrderStatus
  price_cents: number | null
  note: string | null
  created_at: string
  room_id: string | null
  service_id: string
}

interface Props {
  initialOrders: OrderRecord[]
  rooms: RoomOption[]
  services: ServiceOption[]
  canEditStatus: boolean
  canExport: boolean
}

type Tab = 'active' | 'history'

const ACTIVE_STATUSES: OrderStatus[] = ['new', 'confirmed']
const HISTORY_STATUSES: OrderStatus[] = ['fulfilled', 'rejected']
const TRANSITION_ACTION_KEY: Record<OrderStatus, string> = {
  new: '',
  confirmed: 'confirm',
  fulfilled: 'fulfill',
  rejected: 'reject',
}

function formatPrice(priceCents: number | null): string {
  if (priceCents === null) return ''
  return `${(priceCents / 100).toFixed(2)} zł`
}

export default function OrdersPanel({ initialOrders, rooms, services, canEditStatus, canExport }: Props) {
  const t = useTranslations('orders')
  const [orders, setOrders] = useState<OrderRecord[]>(initialOrders)
  const [tab, setTab] = useState<Tab>('active')
  const [connectionLost, setConnectionLost] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const roomById = useMemo(() => new Map(rooms.map(r => [r.id, r.room_number])), [rooms])
  const serviceById = useMemo(() => new Map(services.map(s => [s.id, s.name])), [services])

  const roomByIdRef = useRef(roomById)
  const serviceByIdRef = useRef(serviceById)
  useEffect(() => {
    roomByIdRef.current = roomById
    serviceByIdRef.current = serviceById
  }, [roomById, serviceById])

  useEffect(() => {
    const source = new EventSource('/api/orders/stream')

    source.onopen = () => setConnectionLost(false)
    source.onerror = () => setConnectionLost(true)
    source.onmessage = event => {
      const payload: SseOrderPayload = JSON.parse(event.data)
      const record: OrderRecord = {
        id: payload.id,
        status: payload.status,
        priceCents: payload.price_cents,
        note: payload.note,
        createdAt: payload.created_at,
        roomNumber: payload.room_id ? roomByIdRef.current.get(payload.room_id) ?? null : null,
        serviceName: serviceByIdRef.current.get(payload.service_id) ?? '',
      }
      setOrders(prev => {
        const index = prev.findIndex(o => o.id === record.id)
        if (index === -1) return [record, ...prev]
        const next = [...prev]
        next[index] = record
        return next
      })
    }

    return () => source.close()
  }, [])

  const visibleOrders = orders.filter(o =>
    (tab === 'active' ? ACTIVE_STATUSES : HISTORY_STATUSES).includes(o.status)
  )

  const exportUrl = useMemo(() => {
    const statuses = tab === 'active' ? ACTIVE_STATUSES : HISTORY_STATUSES
    const params = new URLSearchParams()
    for (const status of statuses) params.append('status', status)
    return `/api/orders/export?${params.toString()}`
  }, [tab])

  function handleStatusChange(orderId: string, newStatus: OrderStatus) {
    setError(null)
    startTransition(async () => {
      const result = await updateOrderStatus(orderId, newStatus)
      if (result.error) setError(result.error)
    })
  }

  return (
    <div className="space-y-4">
      {connectionLost && (
        <p role="alert" className="rounded-md border border-panel-warning/30 bg-panel-warning/10 px-3 py-2 text-sm text-panel-warning">
          {t('connection.lost')}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(`errors.${error}`)}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button
            type="button"
            variant={tab === 'active' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTab('active')}
          >
            {t('tabs.active')}
          </Button>
          <Button
            type="button"
            variant={tab === 'history' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTab('history')}
          >
            {t('tabs.history')}
          </Button>
        </div>
        {canExport && (
          <Button asChild variant="outline" size="sm">
            <a href={exportUrl} download>{t('actions.export')}</a>
          </Button>
        )}
      </div>

      {visibleOrders.length === 0 ? (
        <p className="italic text-panel-ink-muted">{t('list.empty')}</p>
      ) : (
        <ul className={cn('divide-y divide-border rounded-md border border-border')}>
          {visibleOrders.map(order => (
            <li key={order.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{order.serviceName}</span>
                <span className="text-sm text-panel-ink-muted">
                  {order.roomNumber ? `${t('list.room')} ${order.roomNumber}` : t('list.noRoom')}
                </span>
                <span className="font-mono text-sm text-panel-ink-muted">{formatPrice(order.priceCents)}</span>
                <Badge variant="secondary">{t(`status.${order.status}`)}</Badge>
              </div>
              {canEditStatus && (
                <div className="flex gap-2">
                  {ALLOWED_TRANSITIONS[order.status].map(target => (
                    <Button
                      key={target}
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      onClick={() => handleStatusChange(order.id, target)}
                    >
                      {t(`actions.${TRANSITION_ACTION_KEY[target]}`)}
                    </Button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
