import { Ratelimit } from '@upstash/ratelimit'
import { getRedis } from './client'

let _ratelimit: Ratelimit | undefined

function getConciergeRatelimit(): Ratelimit {
  if (!_ratelimit) {
    const max = Number(process.env.CONCIERGE_RATE_LIMIT_MAX ?? 20)
    const window = process.env.CONCIERGE_RATE_LIMIT_WINDOW ?? '60 m'
    _ratelimit = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(max, window as `${number} ${'ms' | 's' | 'm' | 'h' | 'd'}`),
      prefix: 'rl:concierge',
    })
  }
  return _ratelimit
}

export async function checkConciergeRateLimit(
  sessionId: string
): Promise<{ allowed: boolean; remaining: number; retryAfter: number }> {
  const result = await getConciergeRatelimit().limit(sessionId)
  return {
    allowed: result.success,
    remaining: result.remaining,
    retryAfter: Math.ceil((result.reset - Date.now()) / 1000),
  }
}
