import { Redis } from '@upstash/redis'

let _redis: Redis | undefined

export function getRedis(): Redis {
  if (!_redis) {
    const url = process.env.UPSTASH_REDIS_REST_URL
    const token = process.env.UPSTASH_REDIS_REST_TOKEN
    if (!url || !token) {
      throw new Error(
        'Missing Upstash Redis config: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set'
      )
    }
    _redis = new Redis({ url, token })
  }
  return _redis
}
