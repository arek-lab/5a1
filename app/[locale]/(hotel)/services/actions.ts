'use server'

import { revalidatePath } from 'next/cache'
import { createServerClient } from '@/lib/supabase/server'
import { getHotelUser, type HotelUser } from '@/lib/panel/auth'
import { canPerform } from '@/lib/panel/rbac'
import { validateServiceInput, wouldExceedPinLimit } from '@/lib/panel/service-validation'
import { SERVICE_TEMPLATES } from '@/lib/panel/service-templates'
import { captureEvent } from '@/lib/analytics/capture'

type ActionResult = { error?: string }

async function requireServicesWriteAccess(): Promise<HotelUser | null> {
  const hotelUser = await getHotelUser()
  if (!hotelUser || !canPerform(hotelUser.role, 'services', 'write')) {
    return null
  }
  return hotelUser
}

function revalidateServicePaths() {
  revalidatePath('/services')
  revalidatePath('/onboarding')
}

export async function createServiceFromTemplate(formData: FormData): Promise<ActionResult> {
  const hotelUser = await requireServicesWriteAccess()
  if (!hotelUser) return { error: 'forbidden' }

  const templateKey = String(formData.get('template_key') ?? '')
  const template = SERVICE_TEMPLATES.find((t) => t.key === templateKey)
  if (!template) {
    throw new Error(`Unknown service template: ${templateKey}`)
  }

  const validated = validateServiceInput({
    name: String(formData.get('name') ?? ''),
    category: template.category,
    priceCentsRaw: String(formData.get('price_cents') ?? template.suggestedPriceCents ?? ''),
    imageUrl: String(formData.get('image_url') ?? ''),
  })
  if (!validated.ok) return { error: validated.error }

  const supabase = await createServerClient()
  const { error } = await supabase.from('services').insert({
    property_id: hotelUser.propertyId,
    template_key: template.key,
    name: validated.value.name,
    description: String(formData.get('description') ?? '').trim() || null,
    category: validated.value.category,
    price_cents: validated.value.priceCents,
    image_url: validated.value.imageUrl,
  })

  if (error) {
    throw new Error(error.message)
  }

  void captureEvent(
    { name: 'hotel_settings_updated', properties: { area: 'services' } },
    { distinctId: hotelUser.id, propertyId: hotelUser.propertyId }
  )

  revalidateServicePaths()
  return {}
}

export async function createCustomService(formData: FormData): Promise<ActionResult> {
  const hotelUser = await requireServicesWriteAccess()
  if (!hotelUser) return { error: 'forbidden' }

  const validated = validateServiceInput({
    name: String(formData.get('name') ?? ''),
    category: String(formData.get('category') ?? ''),
    priceCentsRaw: String(formData.get('price_cents') ?? ''),
    imageUrl: String(formData.get('image_url') ?? ''),
  })
  if (!validated.ok) return { error: validated.error }

  const supabase = await createServerClient()
  const { error } = await supabase.from('services').insert({
    property_id: hotelUser.propertyId,
    name: validated.value.name,
    description: String(formData.get('description') ?? '').trim() || null,
    category: validated.value.category,
    price_cents: validated.value.priceCents,
    image_url: validated.value.imageUrl,
  })

  if (error) {
    throw new Error(error.message)
  }

  void captureEvent(
    { name: 'hotel_settings_updated', properties: { area: 'services' } },
    { distinctId: hotelUser.id, propertyId: hotelUser.propertyId }
  )

  revalidateServicePaths()
  return {}
}

export async function updateService(formData: FormData): Promise<ActionResult> {
  const hotelUser = await requireServicesWriteAccess()
  if (!hotelUser) return { error: 'forbidden' }

  const id = String(formData.get('id') ?? '')
  if (!id) return { error: 'forbidden' }

  const validated = validateServiceInput({
    name: String(formData.get('name') ?? ''),
    category: String(formData.get('category') ?? ''),
    priceCentsRaw: String(formData.get('price_cents') ?? ''),
    imageUrl: String(formData.get('image_url') ?? ''),
  })
  if (!validated.ok) return { error: validated.error }

  const supabase = await createServerClient()
  const { error } = await supabase
    .from('services')
    .update({
      name: validated.value.name,
      description: String(formData.get('description') ?? '').trim() || null,
      category: validated.value.category,
      price_cents: validated.value.priceCents,
      image_url: validated.value.imageUrl,
    })
    .eq('id', id)
    .eq('property_id', hotelUser.propertyId)

  if (error) {
    throw new Error(error.message)
  }

  void captureEvent(
    { name: 'hotel_settings_updated', properties: { area: 'services' } },
    { distinctId: hotelUser.id, propertyId: hotelUser.propertyId }
  )

  revalidateServicePaths()
  return {}
}

export async function toggleServiceActive(id: string, isActive: boolean): Promise<ActionResult> {
  const hotelUser = await requireServicesWriteAccess()
  if (!hotelUser) return { error: 'forbidden' }

  const supabase = await createServerClient()
  const { error } = await supabase
    .from('services')
    .update({ is_active: isActive })
    .eq('id', id)
    .eq('property_id', hotelUser.propertyId)

  if (error) {
    throw new Error(error.message)
  }

  void captureEvent(
    { name: 'hotel_settings_updated', properties: { area: 'services' } },
    { distinctId: hotelUser.id, propertyId: hotelUser.propertyId }
  )

  revalidateServicePaths()
  return {}
}

export async function toggleServicePin(id: string, isPinned: boolean): Promise<ActionResult> {
  const hotelUser = await requireServicesWriteAccess()
  if (!hotelUser) return { error: 'forbidden' }

  const supabase = await createServerClient()

  if (isPinned) {
    const { count, error: countError } = await supabase
      .from('services')
      .select('id', { count: 'exact', head: true })
      .eq('property_id', hotelUser.propertyId)
      .eq('is_pinned', true)
      .neq('id', id)

    if (countError) {
      throw new Error(countError.message)
    }

    if (wouldExceedPinLimit(count ?? 0)) {
      return { error: 'pinLimitExceeded' }
    }
  }

  const { error } = await supabase
    .from('services')
    .update({ is_pinned: isPinned })
    .eq('id', id)
    .eq('property_id', hotelUser.propertyId)

  if (error) {
    throw new Error(error.message)
  }

  void captureEvent(
    { name: 'hotel_settings_updated', properties: { area: 'services' } },
    { distinctId: hotelUser.id, propertyId: hotelUser.propertyId }
  )

  revalidateServicePaths()
  return {}
}
