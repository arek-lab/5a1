import { getRedis } from '@/lib/rate-limit/client'

export type IpInfo = { asn: number | null; country: string | null }

function isPrivateIp(ip: string): boolean {
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'unknown') return true
  if (ip.startsWith('10.')) return true
  if (ip.startsWith('192.168.')) return true
  const parts = ip.split('.')
  if (parts.length === 4 && parts[0] === '172') {
    const second = parseInt(parts[1], 10)
    if (second >= 16 && second <= 31) return true
  }
  return false
}

export async function resolveIpInfo(ip: string): Promise<IpInfo> {
  if (isPrivateIp(ip)) return { asn: null, country: null }

  const redis = getRedis()
  const cacheKey = `geo:${ip}`

  const cached = await redis.get<IpInfo>(cacheKey)
  if (cached) return cached

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode,as`, {
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) return { asn: null, country: null }

    const data = (await res.json()) as { countryCode?: string; as?: string }
    const country = data.countryCode ?? null
    let asn: number | null = null
    if (data.as) {
      const match = data.as.match(/^AS(\d+)/)
      if (match) asn = parseInt(match[1], 10)
    }

    const result: IpInfo = { asn, country }
    await redis.set(cacheKey, result, { ex: 3600 })
    return result
  } catch {
    return { asn: null, country: null }
  }
}
