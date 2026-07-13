import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const limitMock = vi.fn()
const ratelimitCtorMock = vi.fn()

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: Object.assign(
    vi.fn().mockImplementation((...args: unknown[]) => {
      ratelimitCtorMock(...args)
      return { limit: limitMock }
    }),
    { slidingWindow: vi.fn((max: number, window: string) => ({ max, window })) }
  ),
}))

vi.mock('../client', () => ({
  getRedis: vi.fn(() => ({})),
}))

describe('checkConciergeRateLimit', () => {
  beforeEach(() => {
    vi.resetModules()
    limitMock.mockReset()
    ratelimitCtorMock.mockReset()
  })

  afterEach(() => {
    delete process.env.CONCIERGE_RATE_LIMIT_MAX
    delete process.env.CONCIERGE_RATE_LIMIT_WINDOW
  })

  it('returns allowed=true with remaining/retryAfter when under the limit', async () => {
    limitMock.mockResolvedValue({ success: true, remaining: 4, reset: Date.now() + 5000 })
    const { checkConciergeRateLimit } = await import('../concierge')

    const result = await checkConciergeRateLimit('session-1')

    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(4)
    expect(result.retryAfter).toBeGreaterThanOrEqual(0)
    expect(limitMock).toHaveBeenCalledWith('session-1')
  })

  it('returns allowed=false when over the limit', async () => {
    limitMock.mockResolvedValue({ success: false, remaining: 0, reset: Date.now() + 5000 })
    const { checkConciergeRateLimit } = await import('../concierge')

    const result = await checkConciergeRateLimit('session-1')

    expect(result.allowed).toBe(false)
  })

  it('uses the rl:concierge key prefix, keyed by sessionId not IP', async () => {
    limitMock.mockResolvedValue({ success: true, remaining: 1, reset: Date.now() })
    const { checkConciergeRateLimit } = await import('../concierge')

    await checkConciergeRateLimit('session-abc')

    expect(ratelimitCtorMock).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: 'rl:concierge' })
    )
  })

  it('reads CONCIERGE_RATE_LIMIT_MAX / WINDOW env vars', async () => {
    process.env.CONCIERGE_RATE_LIMIT_MAX = '3'
    process.env.CONCIERGE_RATE_LIMIT_WINDOW = '10 m'
    limitMock.mockResolvedValue({ success: true, remaining: 1, reset: Date.now() })
    const { checkConciergeRateLimit } = await import('../concierge')

    await checkConciergeRateLimit('session-1')

    expect(ratelimitCtorMock).toHaveBeenCalledWith(
      expect.objectContaining({ limiter: { max: 3, window: '10 m' } })
    )
  })
})
