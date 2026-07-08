import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type Handler = (...args: unknown[]) => void

type MockClient = {
  connect: ReturnType<typeof vi.fn>
  query: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  removeAllListeners: ReturnType<typeof vi.fn>
  emit: (event: string, ...args: unknown[]) => void
}

let mockClients: MockClient[] = []

vi.mock('pg', () => ({
  Client: vi.fn().mockImplementation(() => {
    const handlers: Record<string, Handler[]> = {}
    const client: MockClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue(undefined),
      on: vi.fn((event: string, cb: Handler) => {
        ;(handlers[event] ??= []).push(cb)
      }),
      removeAllListeners: vi.fn(),
      emit: (event, ...args) => {
        ;(handlers[event] ?? []).forEach((cb) => cb(...args))
      },
    }
    mockClients.push(client)
    return client
  }),
}))

function makePayload(overrides: Partial<{ property_id: string; id: string; status: string }> = {}) {
  return {
    id: 'order-1',
    property_id: 'prop-a',
    status: 'confirmed',
    ...overrides,
  }
}

describe('subscribeToOrderChanges', () => {
  beforeEach(() => {
    mockClients = []
    delete (globalThis as { __ordersListenerEmitter?: unknown }).__ordersListenerEmitter
    vi.resetModules()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('delivers events only to subscribers of the matching property_id', async () => {
    const { subscribeToOrderChanges } = await import('../listener')

    const onA = vi.fn()
    const onB = vi.fn()
    subscribeToOrderChanges('prop-a', onA)
    subscribeToOrderChanges('prop-b', onB)

    await vi.waitFor(() => expect(mockClients).toHaveLength(1))
    await vi.waitFor(() => expect(mockClients[0].query).toHaveBeenCalledWith('LISTEN orders_changed'))

    const client = mockClients[0]
    client.emit('notification', {
      channel: 'orders_changed',
      payload: JSON.stringify(makePayload({ property_id: 'prop-a' })),
    })

    expect(onA).toHaveBeenCalledTimes(1)
    expect(onB).not.toHaveBeenCalled()
  })

  it('unsubscribe stops further delivery', async () => {
    const { subscribeToOrderChanges } = await import('../listener')

    const onA = vi.fn()
    const unsubscribe = subscribeToOrderChanges('prop-a', onA)
    await vi.waitFor(() => expect(mockClients).toHaveLength(1))

    unsubscribe()
    mockClients[0].emit('notification', {
      channel: 'orders_changed',
      payload: JSON.stringify(makePayload()),
    })

    expect(onA).not.toHaveBeenCalled()
  })

  it('reconnects after a connection error', async () => {
    const { subscribeToOrderChanges } = await import('../listener')

    subscribeToOrderChanges('prop-a', vi.fn())
    await vi.waitFor(() => expect(mockClients).toHaveLength(1))

    mockClients[0].emit('error', new Error('connection lost'))
    await vi.advanceTimersByTimeAsync(1000)

    expect(mockClients).toHaveLength(2)
    await vi.waitFor(() => expect(mockClients[1].connect).toHaveBeenCalled())
  })
})
