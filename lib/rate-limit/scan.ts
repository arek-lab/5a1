import { Ratelimit } from '@upstash/ratelimit'
import { getRedis } from './client'

let _ratelimit: Ratelimit | undefined

function getRatelimit(): Ratelimit {
  if (!_ratelimit) {
    _ratelimit = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(5, '15 m'),
      prefix: 'rl:scan',
    })
  }
  return _ratelimit
}

export async function checkScanRateLimit(
  ip: string
): Promise<{ allowed: boolean; remaining: number; retryAfter: number }> {
  const result = await getRatelimit().limit(ip)
  return {
    allowed: result.success,
    remaining: result.remaining,
    retryAfter: Math.ceil((result.reset - Date.now()) / 1000),
  }
}
