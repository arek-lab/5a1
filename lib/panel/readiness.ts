import { createServerClient } from '@/lib/supabase/server'

export type ReadinessCounts = {
  activeServicesCount: number
  knowledgeChunksCount: number
  activeReceptionQrCount: number
}

export type ReadinessBreakdown = Record<'profile' | 'services' | 'knowledge' | 'qr', boolean>

export function isProfileComplete(property: {
  name: string
  address: string | null
  phone_reception: string | null
  check_in_time: string | null
  check_out_time: string | null
}): boolean {
  return (
    !!property.name &&
    !!property.address &&
    !!property.phone_reception &&
    !!property.check_in_time &&
    !!property.check_out_time
  )
}

export function computeReadiness(
  profileComplete: boolean,
  counts: ReadinessCounts
): { percentage: number; breakdown: ReadinessBreakdown } {
  const breakdown: ReadinessBreakdown = {
    profile: profileComplete,
    services: counts.activeServicesCount >= 3,
    knowledge: counts.knowledgeChunksCount > 0,
    qr: counts.activeReceptionQrCount > 0,
  }

  const percentage = Object.values(breakdown).filter(Boolean).length * 25

  return { percentage, breakdown }
}

export async function getReadiness(propertyId: string) {
  const supabase = await createServerClient()

  const [{ data: property }, servicesResult, knowledgeResult, qrResult] = await Promise.all([
    supabase
      .from('properties')
      .select('name, address, phone_reception, check_in_time, check_out_time')
      .eq('id', propertyId)
      .single(),
    supabase
      .from('services')
      .select('id', { count: 'exact', head: true })
      .eq('property_id', propertyId)
      .eq('is_active', true),
    supabase
      .from('knowledge_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('property_id', propertyId),
    supabase
      .from('qr_codes')
      .select('id', { count: 'exact', head: true })
      .eq('property_id', propertyId)
      .eq('type', 'reception')
      .eq('is_active', true),
  ])

  const profileComplete = property ? isProfileComplete(property) : false

  return computeReadiness(profileComplete, {
    activeServicesCount: servicesResult.count ?? 0,
    knowledgeChunksCount: knowledgeResult.count ?? 0,
    activeReceptionQrCount: qrResult.count ?? 0,
  })
}
