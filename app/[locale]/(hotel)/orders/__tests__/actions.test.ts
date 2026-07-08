import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { HotelUser } from '@/lib/panel/auth'

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))
vi.mock('@/lib/panel/auth', () => ({
  getHotelUser: vi.fn(),
}))
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(),
}))

import { revalidatePath } from 'next/cache'
import { getHotelUser } from '@/lib/panel/auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { updateOrderStatus } from '../actions'

const mockGetHotelUser = vi.mocked(getHotelUser)
const mockCreateClient = vi.mocked(createServiceRoleClient)

const PROP = 'prop-abc'
const ORDER = 'order-1'

function makeUser(overrides: Partial<HotelUser> = {}): HotelUser {
  return {
    id: 'user-1',
    propertyId: PROP,
    role: 'staff',
    fullName: 'Test User',
    email: 'test@example.com',
    ...overrides,
  }
}

function makeClient({
  currentStatus,
  updateError = null,
}: {
  currentStatus: string
  updateError?: Error | null
}) {
  const updateChain = {
    eq: vi.fn().mockReturnThis(),
    then: (onFulfilled: (v: { error: Error | null }) => unknown) =>
      Promise.resolve({ error: updateError }).then(onFulfilled),
  }

  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { status: currentStatus }, error: null }),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue(updateChain),
    }),
  }
}

describe('updateOrderStatus', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns forbidden when caller lacks orders_status write access', async () => {
    mockGetHotelUser.mockResolvedValue(makeUser({ role: 'viewer' }))

    const result = await updateOrderStatus(ORDER, 'confirmed')

    expect(result).toEqual({ error: 'forbidden' })
  })

  it('returns invalidTransition for a disallowed transition', async () => {
    mockGetHotelUser.mockResolvedValue(makeUser({ role: 'staff' }))
    mockCreateClient.mockReturnValue(makeClient({ currentStatus: 'new' }) as never)

    const result = await updateOrderStatus(ORDER, 'fulfilled')

    expect(result).toEqual({ error: 'invalidTransition' })
  })

  it('updates status and revalidates on a valid transition', async () => {
    mockGetHotelUser.mockResolvedValue(makeUser({ role: 'staff' }))
    mockCreateClient.mockReturnValue(makeClient({ currentStatus: 'new' }) as never)

    const result = await updateOrderStatus(ORDER, 'confirmed')

    expect(result).toEqual({})
    expect(revalidatePath).toHaveBeenCalledWith('/orders')
  })
})
