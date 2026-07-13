import { withTenantContext } from '@/lib/supabase/tenant'
import { getRedis } from '@/lib/rate-limit/client'
import { composeKb } from './compose'

const CACHE_TTL_SECONDS = 86_400

type CachedKb = { hash: string; markdown: string }

function cacheKey(propertyId: string): string {
  return `kb:${propertyId}`
}

export async function getOrComposeKb(
  headers: Pick<Headers, 'get'>
): Promise<{ markdown: string; hash: string; cacheHit: boolean }> {
  const client = await withTenantContext(headers)
  const propertyId = headers.get('x-property-id')!
  const { hash, markdown } = await composeKb(client, propertyId)

  const redis = getRedis()
  const cached = await redis.get<CachedKb>(cacheKey(propertyId))

  if (cached && cached.hash === hash) {
    return { markdown: cached.markdown, hash, cacheHit: true }
  }

  await redis.set<CachedKb>(cacheKey(propertyId), { hash, markdown }, { ex: CACHE_TTL_SECONDS })
  return { markdown, hash, cacheHit: false }
}
