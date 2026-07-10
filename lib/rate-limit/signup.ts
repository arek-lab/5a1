import { Ratelimit } from '@upstash/ratelimit'
import { getRedis } from './client'

let _ratelimit: Ratelimit | undefined

function getSignupRatelimit(): Ratelimit {
  if (!_ratelimit) {
    const max = Number(process.env.SIGNUP_RATE_LIMIT_MAX ?? 5)
    const window = process.env.SIGNUP_RATE_LIMIT_WINDOW ?? '60 m'
    _ratelimit = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(max, window as `${number} ${'ms' | 's' | 'm' | 'h' | 'd'}`),
      prefix: 'rl:signup',
    })
  }
  return _ratelimit
}

export async function checkSignupRateLimit(
  ip: string
): Promise<{ allowed: boolean; remaining: number; retryAfter: number }> {
  const result = await getSignupRatelimit().limit(ip)
  return {
    allowed: result.success,
    remaining: result.remaining,
    retryAfter: Math.ceil((result.reset - Date.now()) / 1000),
  }
}
