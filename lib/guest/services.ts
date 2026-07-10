import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { ServiceCategory } from '@/lib/panel/service-categories'

export type PinnedService = {
  id: string
  name: string
  category: ServiceCategory
  priceCents: number | null
  imageUrl: string | null
}

export async function getPinnedServices(
  client: SupabaseClient<Database>,
  propertyId: string
): Promise<PinnedService[]> {
  const { data, error } = await client
    .from('services')
    .select('id, name, category, price_cents, image_url')
    .eq('property_id', propertyId)
    .eq('is_pinned', true)
    .eq('is_active', true)
    .order('category', { ascending: true })
    .order('name', { ascending: true })
    .limit(3)

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).map(service => ({
    id: service.id,
    name: service.name,
    category: service.category as ServiceCategory,
    priceCents: service.price_cents,
    imageUrl: service.image_url,
  }))
}
