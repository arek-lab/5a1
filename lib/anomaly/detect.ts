import { getRedis } from '@/lib/rate-limit/client'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

async function revokeSession(sessionId: string, propertyId: string, reason: string): Promise<void> {
  const admin = createServiceRoleClient()

  await admin.from('sessions').update({ revoked: true }).eq('id', sessionId).eq('revoked', false)

  await admin.from('audit_logs').insert({
    property_id: propertyId,
    event_type: 'anomaly_revoke',
    target_id: sessionId,
    metadata: { reason, session_id: sessionId },
  })
}

export async function trackAndDetectAnomaly(params: {
  sessionId: string
  propertyId: string
  asn: number | null
  country: string | null
}): Promise<void> {
  const { sessionId, propertyId, asn, country } = params

  if (asn === null && country === null) return

  const redis = getRedis()
  const asnKey = `anomaly:${sessionId}:asns`
  const countryKey = `anomaly:${sessionId}:country`

  if (asn !== null) {
    await redis.sadd(asnKey, String(asn))
    await redis.expire(asnKey, 1800)
    const count = await redis.scard(asnKey)
    if (count > 2) {
      await revokeSession(sessionId, propertyId, 'anomaly_asn')
      return
    }
  }

  if (country !== null) {
    const stored = await redis.get<string>(countryKey)
    if (stored === null) {
      await redis.set(countryKey, country, { ex: 1800 })
    } else if (stored !== country) {
      await revokeSession(sessionId, propertyId, 'anomaly_country_jump')
    }
  }
}
