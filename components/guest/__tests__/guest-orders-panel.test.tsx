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
})
