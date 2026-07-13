'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { updateOrderStatus } from './actions'
import { ALLOWED_TRANSITIONS, type OrderStatus } from '@/lib/orders/status'

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

const tabButtonClass = (isActive: boolean) =>
  `rounded border px-3 py-1.5 text-sm font-medium ${
    isActive ? 'bg-gray-900 text-white' : 'hover:bg-gray-100'
  }`
const statusButtonClass =
  'rounded border px-2 py-1 text-sm hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50'

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
        <p role="alert" className="rounded border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm text-yellow-900">
          {t('connection.lost')}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {t(`errors.${error}`)}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-2">
          <button type="button" className={tabButtonClass(tab === 'active')} onClick={() => setTab('active')}>
            {t('tabs.active')}
          </button>
          <button type="button" className={tabButtonClass(tab === 'history')} onClick={() => setTab('history')}>
            {t('tabs.history')}
          </button>
        </div>
        {canExport && (
          <a href={exportUrl} download className={statusButtonClass}>
            {t('actions.export')}
          </a>
        )}
      </div>

      {visibleOrders.length === 0 ? (
        <p className="italic text-gray-500">{t('list.empty')}</p>
      ) : (
        <ul className="divide-y rounded border">
          {visibleOrders.map(order => (
            <li key={order.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-gray-900">{order.serviceName}</span>
                <span className="text-sm text-gray-500">
                  {order.roomNumber ? `${t('list.room')} ${order.roomNumber}` : t('list.noRoom')}
                </span>
                <span className="text-sm text-gray-500">{formatPrice(order.priceCents)}</span>
                <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700">
                  {t(`status.${order.status}`)}
                </span>
              </div>
              {canEditStatus && (
                <div className="flex gap-2">
                  {ALLOWED_TRANSITIONS[order.status].map(target => (
                    <button
                      key={target}
                      type="button"
                      className={statusButtonClass}
                      disabled={isPending}
                      onClick={() => handleStatusChange(order.id, target)}
                    >
                      {t(`actions.${TRANSITION_ACTION_KEY[target]}`)}
                    </button>
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
