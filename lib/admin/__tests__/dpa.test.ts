import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(),
}))

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { listPropertiesDpa, markDpaSigned } from '@/lib/admin/dpa'

const mockCreateClient = vi.mocked(createServiceRoleClient)

function makeUpdateClient({
  returnedRows,
  capture,
  error = null,
}: {
  returnedRows: Array<{ id: string }>
  capture?: { payload: unknown; eqArgs: unknown[]; isArgs: unknown[] }
  error?: Error | null
}) {
  return {
    from: vi.fn((table: string) => {
      if (table !== 'properties') throw new Error(`unexpected table: ${table}`)
      return {
        update: vi.fn((payload: unknown) => {
          if (capture) capture.payload = payload
          return {
            eq: vi.fn((...eqArgs: unknown[]) => {
              if (capture) capture.eqArgs = eqArgs
              return {
                is: vi.fn((...isArgs: unknown[]) => {
                  if (capture) capture.isArgs = isArgs
                  return {
                    select: vi.fn().mockResolvedValue({
                      data: error ? null : returnedRows,
                      error,
                    }),
                  }
                }),
              }
            }),
          }
        }),
      }
    }),
  }
}

describe('markDpaSigned', () => {
  beforeEach(() => vi.resetAllMocks())

  it('sets dpa_signed_at only where it is currently null, scoped to the property', async () => {
    const capture = { payload: null as unknown, eqArgs: [] as unknown[], isArgs: [] as unknown[] }
    mockCreateClient.mockReturnValue(
      makeUpdateClient({ returnedRows: [{ id: 'prop-1' }], capture }) as never
    )

    const before = Date.now()
    const result = await markDpaSigned('prop-1')
    const after = Date.now()

    expect(result.updated).toBe(true)
    expect(capture.eqArgs).toEqual(['id', 'prop-1'])
    expect(capture.isArgs).toEqual(['dpa_signed_at', null])

    const payload = capture.payload as { dpa_signed_at: string }
    const ts = new Date(payload.dpa_signed_at).getTime()
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(after)
  })

  it('returns updated=false when the property is already signed (0 matched rows)', async () => {
    mockCreateClient.mockReturnValue(
      makeUpdateClient({ returnedRows: [] }) as never
    )

    const result = await markDpaSigned('prop-already-signed')
    expect(result.updated).toBe(false)
  })

  it('throws on database error', async () => {
    mockCreateClient.mockReturnValue(
      makeUpdateClient({ returnedRows: [], error: new Error('boom') }) as never
    )

    await expect(markDpaSigned('prop-1')).rejects.toThrow('boom')
  })
})

describe('listPropertiesDpa', () => {
  beforeEach(() => vi.resetAllMocks())

  it('maps rows to id/name/dpaSignedAt', async () => {
    const rows = [
      { id: 'p1', name: 'Hotel A', dpa_signed_at: '2026-07-01T00:00:00Z' },
      { id: 'p2', name: 'Hotel B', dpa_signed_at: null },
    ]
    mockCreateClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: rows, error: null }),
        }),
      })),
    } as never)

    const result = await listPropertiesDpa()
    expect(result).toEqual([
      { id: 'p1', name: 'Hotel A', dpaSignedAt: '2026-07-01T00:00:00Z' },
      { id: 'p2', name: 'Hotel B', dpaSignedAt: null },
    ])
  })
})
