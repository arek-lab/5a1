import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { SERVICE_CATEGORIES, type ServiceCategory } from '@/lib/panel/service-categories'

export type PinnedService = {
  id: string
  name: string
  category: ServiceCategory
  priceCents: number | null
  imageUrl: string | null
}

export type ServiceListItem = {
  id: string
  name: string
  priceCents: number | null
  imageUrl: string | null
  isActive: boolean
}

export type ServiceDetail = {
  id: string
  name: string
  description: string | null
  category: ServiceCategory
  priceCents: number | null
  imageUrl: string | null
  isActive: boolean
  isTimeSensitive: boolean
  availableFrom: string | null
  availableTo: string | null
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

export async function getVisibleCategories(
  client: SupabaseClient<Database>,
  propertyId: string
): Promise<ServiceCategory[]> {
  const { data, error } = await client
    .from('services')
    .select('category')
    .eq('property_id', propertyId)
    .eq('is_active', true)

  if (error) {
    throw new Error(error.message)
  }

  const present = new Set((data ?? []).map(service => service.category))
  return SERVICE_CATEGORIES.filter(category => present.has(category))
}

export async function getServicesByCategory(
  client: SupabaseClient<Database>,
  propertyId: string,
  category: ServiceCategory
): Promise<ServiceListItem[]> {
  const { data, error } = await client
    .from('services')
    .select('id, name, price_cents, image_url, is_active')
    .eq('property_id', propertyId)
    .eq('category', category)
    .order('is_active', { ascending: false })
    .order('name', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).map(service => ({
    id: service.id,
    name: service.name,
    priceCents: service.price_cents,
    imageUrl: service.image_url,
    isActive: service.is_active,
  }))
}

export async function getServiceById(
  client: SupabaseClient<Database>,
  propertyId: string,
  serviceId: string
): Promise<ServiceDetail | null> {
  const { data, error } = await client
    .from('services')
    .select(
      'id, name, description, category, price_cents, image_url, is_active, is_time_sensitive, available_from, available_to'
    )
    .eq('property_id', propertyId)
    .eq('id', serviceId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  if (!data) return null

  return {
    id: data.id,
    name: data.name,
    description: data.description,
    category: data.category as ServiceCategory,
    priceCents: data.price_cents,
    imageUrl: data.image_url,
    isActive: data.is_active,
    isTimeSensitive: data.is_time_sensitive,
    availableFrom: data.available_from,
    availableTo: data.available_to,
  }
}
