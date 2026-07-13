// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { GuestOrdersPanel } from '../guest-orders-panel'
import type { GuestOrder } from '@/lib/guest/orders'
import messages from '@/messages/pl.json'

class MockEventSource {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  close = vi.fn()
  static instances: MockEventSource[] = []

  constructor() {
    MockEventSource.instances.push(this)
  }
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

beforeEach(() => {
  MockEventSource.instances = []
  vi.stubGlobal('EventSource', MockEventSource as unknown as typeof EventSource)
})

function renderPanel(initialOrders: GuestOrder[]) {
  return render(
    <NextIntlClientProvider locale="pl" messages={messages}>
      <GuestOrdersPanel initialOrders={initialOrders} />
    </NextIntlClientProvider>
  )
}

const order: GuestOrder = {
  id: 'order-1',
  status: 'new',
  createdAt: '2026-07-13T10:00:00.000Z',
  scheduledAt: null,
  note: null,
  serviceName: 'Masaż',
}

describe('GuestOrdersPanel', () => {
  it('renders the empty state with a link back to services when there are no orders', () => {
    renderPanel([])

    expect(screen.getByText('Nie masz jeszcze żadnych zamówień.')).toBeTruthy()
    expect(screen.getByText('Przeglądaj usługi').closest('a')).toHaveProperty('href', expect.stringContaining('/'))
  })

  it('renders the initial orders with friendly status labels', () => {
    renderPanel([order])

    expect(screen.getByText('Masaż')).toBeTruthy()
    expect(screen.getByText('Złożone')).toBeTruthy()
  })

  it('merges an incoming SSE status update into the matching order by id', () => {
    renderPanel([order])

    const source = MockEventSource.instances[0]
    act(() => {
      source.onmessage?.({
        data: JSON.stringify({
          id: 'order-1',
          status: 'confirmed',
          note: null,
          created_at: order.createdAt,
          scheduled_at: null,
        }),
      } as MessageEvent)
    })

    expect(screen.getByText('Przyjęte')).toBeTruthy()
    expect(screen.queryByText('Złożone')).toBeNull()
  })

  it('shows a toast when an incoming SSE update transitions an order to rejected', () => {
    renderPanel([order])

    const source = MockEventSource.instances[0]
    act(() => {
      source.onmessage?.({
        data: JSON.stringify({
          id: 'order-1',
          status: 'rejected',
          note: null,
          created_at: order.createdAt,
          scheduled_at: null,
        }),
      } as MessageEvent)
    })

    expect(screen.getByText('Twoje zamówienie zostało odrzucone.')).toBeTruthy()
  })

  it('falls back to polling after the SSE connection errors, and keeps polling after recovery', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        orders: [{ ...order, status: 'confirmed' }],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPanel([order])

    const source = MockEventSource.instances[0]
    act(() => {
      source.onerror?.()
    })

    expect(source.close).toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })

    expect(fetchMock).toHaveBeenCalledWith('/api/orders/guest')
    expect(screen.getByText('Przyjęte')).toBeTruthy()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    vi.stubGlobal('fetch', vi.fn())
  })
})
