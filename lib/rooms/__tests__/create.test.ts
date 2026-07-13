import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Tables } from '@/lib/supabase/database.types'

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(),
}))

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRoom, InvalidRoomNumberError, RoomNumberTakenError } from '@/lib/rooms/create'

const mockCreateClient = vi.mocked(createServiceRoleClient)

const PROP = 'prop-abc'

function makeRoomRow(overrides: Partial<Tables<'rooms'>> = {}): Tables<'rooms'> {
  return {
    id: 'room-1',
    created_at: '2024-01-01T00:00:00Z',
    property_id: PROP,
    room_number: '101',
    room_type: null,
    room_active_reservation_id: null,
    valid_from: null,
    valid_until: null,
    ...overrides,
  }
}

function makeClient({
  insertData,
  insertError,
  insertCapture,
}: {
  insertData: Tables<'rooms'> | null
  insertError?: { code?: string; message: string } | null
  insertCapture?: { data: unknown }
}) {
  const single = vi.fn().mockResolvedValue({ data: insertData, error: insertError ?? null })
  return {
    from: vi.fn().mockReturnValue({
      insert: vi.fn((data: unknown) => {
        if (insertCapture) insertCapture.data = data
        return { select: vi.fn().mockReturnValue({ single }) }
      }),
    }),
  }
}

describe('createRoom', () => {
  beforeEach(() => vi.resetAllMocks())

  it('throws InvalidRoomNumberError for an empty/whitespace room number without inserting', async () => {
    const client = makeClient({ insertData: null })
    mockCreateClient.mockReturnValue(client as never)

    await expect(createRoom(PROP, '   ', null)).rejects.toThrow(InvalidRoomNumberError)
    expect(client.from).not.toHaveBeenCalled()
  })

  it('inserts a trimmed room_number with property_id and room_type', async () => {
    const insertCapture: { data: unknown } = { data: null }
    mockCreateClient.mockReturnValue(
      makeClient({ insertData: makeRoomRow(), insertCapture }) as never
    )

    await createRoom(PROP, '  101  ', 'Deluxe')

    const inserted = insertCapture.data as Record<string, unknown>
    expect(inserted.property_id).toBe(PROP)
    expect(inserted.room_number).toBe('101')
    expect(inserted.room_type).toBe('Deluxe')
  })

  it('throws RoomNumberTakenError on a unique_violation (23505)', async () => {
    mockCreateClient.mockReturnValue(
      makeClient({
        insertData: null,
        insertError: { code: '23505', message: 'duplicate key value' },
      }) as never
    )

    await expect(createRoom(PROP, '101', null)).rejects.toThrow(RoomNumberTakenError)
  })

  it('rethrows other DB errors unchanged', async () => {
    mockCreateClient.mockReturnValue(
      makeClient({
        insertData: null,
        insertError: { message: 'connection refused' },
      }) as never
    )

    await expect(createRoom(PROP, '101', null)).rejects.toThrow('connection refused')
  })

  it('returns the inserted row on success', async () => {
    const row = makeRoomRow({ id: 'room-42', room_number: '202' })
    mockCreateClient.mockReturnValue(makeClient({ insertData: row }) as never)

    await expect(createRoom(PROP, '202', null)).resolves.toEqual(row)
  })
})
