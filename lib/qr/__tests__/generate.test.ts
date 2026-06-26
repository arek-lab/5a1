import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Tables } from '@/lib/supabase/database.types'

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(),
}))

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  generateReceptionQR,
  generateRoomQR,
  deactivateRoomQR,
  DpaNotSignedError,
} from '@/lib/qr/generate'

const mockCreateClient = vi.mocked(createServiceRoleClient)

const PROP = 'prop-abc'
const ROOM = 'room-xyz'

function makeQrRow(overrides: Partial<Tables<'qr_codes'>> = {}): Tables<'qr_codes'> {
  return {
    id: 'qr-1',
    created_at: '2024-01-01T00:00:00Z',
    init_token: 'token-1',
    is_active: true,
    property_id: PROP,
    room_id: null,
    type: 'reception',
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    rotates_every: '5 minutes',
    used_at: null,
    ...overrides,
  }
}

function makeUpdateChain(error: Error | null = null) {
  const chain: { eq: ReturnType<typeof vi.fn>; then: typeof Promise.prototype.then } = {
    eq: vi.fn(),
    then: (onFulfilled, onRejected) =>
      Promise.resolve({ error }).then(onFulfilled as never, onRejected),
  }
  chain.eq.mockReturnValue(chain)
  return chain
}

function makeClient({
  dpaSignedAt,
  insertData,
  callOrder,
  insertCapture,
  updateError = null,
  insertError = null,
  dpaError = null,
}: {
  dpaSignedAt: string | null
  insertData: Tables<'qr_codes'>
  callOrder?: string[]
  insertCapture?: { data: unknown }
  updateError?: Error | null
  insertError?: Error | null
  dpaError?: Error | null
}) {
  const propertiesBuilder = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: dpaError ? null : { dpa_signed_at: dpaSignedAt },
          error: dpaError,
        }),
      }),
    }),
  }

  const insertSingle = vi.fn().mockResolvedValue({
    data: insertError ? null : insertData,
    error: insertError,
  })
  const insertBuilder = { select: vi.fn().mockReturnValue({ single: insertSingle }) }

  return {
    from: vi.fn((table: string) => {
      if (table === 'properties') return propertiesBuilder
      return {
        update: vi.fn(() => {
          callOrder?.push('update')
          return makeUpdateChain(updateError)
        }),
        insert: vi.fn((data: unknown) => {
          callOrder?.push('insert')
          if (insertCapture) insertCapture.data = data
          return insertBuilder
        }),
      }
    }),
  }
}

describe('generateReceptionQR', () => {
  beforeEach(() => vi.resetAllMocks())

  it('calls update before insert with same property_id + type=reception filter', async () => {
    const callOrder: string[] = []
    mockCreateClient.mockReturnValue(makeClient({ dpaSignedAt: '2024-01-01', insertData: makeQrRow(), callOrder }) as never)

    await generateReceptionQR(PROP)

    expect(callOrder).toEqual(['update', 'insert'])
  })

  it('inserts row with type=reception, expires_at ~15min from now, rotates_every=5 minutes, is_active=true', async () => {
    const insertCapture: { data: unknown } = { data: null }
    mockCreateClient.mockReturnValue(makeClient({ dpaSignedAt: '2024-01-01', insertData: makeQrRow(), insertCapture }) as never)

    const before = Date.now()
    await generateReceptionQR(PROP)
    const after = Date.now()

    const inserted = insertCapture.data as Record<string, unknown>
    expect(inserted.property_id).toBe(PROP)
    expect(inserted.type).toBe('reception')
    expect(inserted.is_active).toBe(true)
    expect(inserted.rotates_every).toBe('5 minutes')
    const expiresMs = new Date(inserted.expires_at as string).getTime()
    expect(expiresMs).toBeGreaterThanOrEqual(before + 14 * 60 * 1000)
    expect(expiresMs).toBeLessThanOrEqual(after + 16 * 60 * 1000)
  })

  it('throws DpaNotSignedError when dpa_signed_at is null', async () => {
    mockCreateClient.mockReturnValue(makeClient({ dpaSignedAt: null, insertData: makeQrRow() }) as never)

    await expect(generateReceptionQR(PROP)).rejects.toThrow(DpaNotSignedError)
  })

  it('throws when DPA query itself returns a DB error', async () => {
    const dbError = new Error('connection refused')
    mockCreateClient.mockReturnValue(makeClient({ dpaSignedAt: null, insertData: makeQrRow(), dpaError: dbError }) as never)

    await expect(generateReceptionQR(PROP)).rejects.toThrow('connection refused')
  })

  it('throws when update returns a DB error', async () => {
    const dbError = new Error('update failed')
    mockCreateClient.mockReturnValue(makeClient({ dpaSignedAt: '2024-01-01', insertData: makeQrRow(), updateError: dbError }) as never)

    await expect(generateReceptionQR(PROP)).rejects.toThrow('update failed')
  })

  it('throws when insert returns a DB error', async () => {
    const dbError = new Error('insert failed')
    mockCreateClient.mockReturnValue(makeClient({ dpaSignedAt: '2024-01-01', insertData: makeQrRow(), insertError: dbError }) as never)

    await expect(generateReceptionQR(PROP)).rejects.toThrow('insert failed')
  })
})

describe('generateRoomQR', () => {
  beforeEach(() => vi.resetAllMocks())

  it('inserts row with type=room, room_id set, expires_at=null, is_active=true', async () => {
    const insertCapture: { data: unknown } = { data: null }
    const roomRow = makeQrRow({ type: 'room', room_id: ROOM, expires_at: null, rotates_every: null })
    mockCreateClient.mockReturnValue(makeClient({ dpaSignedAt: '2024-01-01', insertData: roomRow, insertCapture }) as never)

    await generateRoomQR(PROP, ROOM)

    const inserted = insertCapture.data as Record<string, unknown>
    expect(inserted.property_id).toBe(PROP)
    expect(inserted.type).toBe('room')
    expect(inserted.room_id).toBe(ROOM)
    expect(inserted.expires_at).toBeNull()
    expect(inserted.is_active).toBe(true)
  })

  it('throws DpaNotSignedError when dpa_signed_at is null', async () => {
    const roomRow = makeQrRow({ type: 'room', room_id: ROOM })
    mockCreateClient.mockReturnValue(makeClient({ dpaSignedAt: null, insertData: roomRow }) as never)

    await expect(generateRoomQR(PROP, ROOM)).rejects.toThrow(DpaNotSignedError)
  })

  it('throws when insert returns a DB error', async () => {
    const dbError = new Error('insert failed')
    const roomRow = makeQrRow({ type: 'room', room_id: ROOM, expires_at: null, rotates_every: null })
    mockCreateClient.mockReturnValue(makeClient({ dpaSignedAt: '2024-01-01', insertData: roomRow, insertError: dbError }) as never)

    await expect(generateRoomQR(PROP, ROOM)).rejects.toThrow('insert failed')
  })
})

describe('deactivateRoomQR', () => {
  beforeEach(() => vi.resetAllMocks())

  it('calls update with is_active=false filtered by property_id, room_id, type=room, is_active=true', async () => {
    const updatePayload: unknown[] = []
    const eqCalls: Array<[string, unknown]> = []

    const chain: { eq: ReturnType<typeof vi.fn>; then: typeof Promise.prototype.then } = {
      eq: vi.fn((col: string, val: unknown) => {
        eqCalls.push([col, val])
        return chain
      }),
      then: (onFulfilled, onRejected) =>
        Promise.resolve({ error: null }).then(onFulfilled as never, onRejected),
    }

    mockCreateClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn((data: unknown) => {
          updatePayload.push(data)
          return chain
        }),
      }),
    } as never)

    await deactivateRoomQR(PROP, ROOM)

    expect(updatePayload[0]).toEqual({ is_active: false })
    expect(eqCalls).toContainEqual(['property_id', PROP])
    expect(eqCalls).toContainEqual(['room_id', ROOM])
    expect(eqCalls).toContainEqual(['type', 'room'])
    expect(eqCalls).toContainEqual(['is_active', true])
  })

  it('throws when update returns a DB error', async () => {
    const dbError = new Error('update failed')

    const errorChain: { eq: ReturnType<typeof vi.fn>; then: typeof Promise.prototype.then } = {
      eq: vi.fn(),
      then: (onFulfilled, onRejected) =>
        Promise.resolve({ error: dbError }).then(onFulfilled as never, onRejected),
    }
    errorChain.eq.mockReturnValue(errorChain)

    mockCreateClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue(errorChain),
      }),
    } as never)

    await expect(deactivateRoomQR(PROP, ROOM)).rejects.toThrow('update failed')
  })
})
