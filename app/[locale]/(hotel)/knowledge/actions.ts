'use server'

import { revalidatePath } from 'next/cache'
import { createServerClient } from '@/lib/supabase/server'
import { getHotelUser, type HotelUser } from '@/lib/panel/auth'
import { canPerform } from '@/lib/panel/rbac'
import { validateKnowledgeInput } from '@/lib/panel/knowledge-validation'
import { computeContentHash } from '@/lib/panel/knowledge-hash'
import { FAQ_TEMPLATES } from '@/lib/panel/faq-templates'
import { captureEvent } from '@/lib/analytics/capture'

type ActionResult = { error?: string }

async function requireKnowledgeWriteAccess(): Promise<HotelUser | null> {
  const hotelUser = await getHotelUser()
  if (!hotelUser || !canPerform(hotelUser.role, 'knowledge', 'write')) {
    return null
  }
  return hotelUser
}

function revalidateKnowledgePaths() {
  revalidatePath('/knowledge')
  revalidatePath('/onboarding')
}

export async function createKnowledgeFromTemplate(formData: FormData): Promise<ActionResult> {
  const hotelUser = await requireKnowledgeWriteAccess()
  if (!hotelUser) return { error: 'forbidden' }

  const templateKey = String(formData.get('template_key') ?? '')
  const template = FAQ_TEMPLATES.find((t) => t.key === templateKey)
  if (!template) {
    throw new Error(`Unknown FAQ template: ${templateKey}`)
  }

  const validated = validateKnowledgeInput({
    question: String(formData.get('question') ?? ''),
    content: String(formData.get('content') ?? ''),
    category: 'faq',
    language: String(formData.get('language') ?? 'pl'),
    validFromRaw: String(formData.get('valid_from') ?? ''),
    validUntilRaw: String(formData.get('valid_until') ?? ''),
  })
  if (!validated.ok) return { error: validated.error }

  const supabase = await createServerClient()
  const { error } = await supabase.from('knowledge_chunks').insert({
    property_id: hotelUser.propertyId,
    category: validated.value.category,
    question: validated.value.question,
    content: validated.value.content,
    language: validated.value.language,
    valid_from: validated.value.validFrom,
    valid_until: validated.value.validUntil,
    content_hash: computeContentHash(validated.value.content),
  })

  if (error) {
    throw new Error(error.message)
  }

  void captureEvent(
    { name: 'hotel_settings_updated', properties: { area: 'knowledge' } },
    { distinctId: hotelUser.id, propertyId: hotelUser.propertyId }
  )

  revalidateKnowledgePaths()
  return {}
}

export async function createKnowledgeEntry(formData: FormData): Promise<ActionResult> {
  const hotelUser = await requireKnowledgeWriteAccess()
  if (!hotelUser) return { error: 'forbidden' }

  const validated = validateKnowledgeInput({
    question: String(formData.get('question') ?? ''),
    content: String(formData.get('content') ?? ''),
    category: String(formData.get('category') ?? ''),
    language: String(formData.get('language') ?? ''),
    validFromRaw: String(formData.get('valid_from') ?? ''),
    validUntilRaw: String(formData.get('valid_until') ?? ''),
  })
  if (!validated.ok) return { error: validated.error }

  const supabase = await createServerClient()
  const { error } = await supabase.from('knowledge_chunks').insert({
    property_id: hotelUser.propertyId,
    category: validated.value.category,
    question: validated.value.question,
    content: validated.value.content,
    language: validated.value.language,
    valid_from: validated.value.validFrom,
    valid_until: validated.value.validUntil,
    content_hash: computeContentHash(validated.value.content),
  })

  if (error) {
    throw new Error(error.message)
  }

  void captureEvent(
    { name: 'hotel_settings_updated', properties: { area: 'knowledge' } },
    { distinctId: hotelUser.id, propertyId: hotelUser.propertyId }
  )

  revalidateKnowledgePaths()
  return {}
}

export async function updateKnowledgeEntry(formData: FormData): Promise<ActionResult> {
  const hotelUser = await requireKnowledgeWriteAccess()
  if (!hotelUser) return { error: 'forbidden' }

  const id = String(formData.get('id') ?? '')
  if (!id) return { error: 'forbidden' }

  const validated = validateKnowledgeInput({
    question: String(formData.get('question') ?? ''),
    content: String(formData.get('content') ?? ''),
    category: String(formData.get('category') ?? ''),
    language: String(formData.get('language') ?? ''),
    validFromRaw: String(formData.get('valid_from') ?? ''),
    validUntilRaw: String(formData.get('valid_until') ?? ''),
  })
  if (!validated.ok) return { error: validated.error }

  const supabase = await createServerClient()
  const { error } = await supabase
    .from('knowledge_chunks')
    .update({
      question: validated.value.question,
      content: validated.value.content,
      category: validated.value.category,
      language: validated.value.language,
      valid_from: validated.value.validFrom,
      valid_until: validated.value.validUntil,
      content_hash: computeContentHash(validated.value.content),
    })
    .eq('id', id)
    .eq('property_id', hotelUser.propertyId)

  if (error) {
    throw new Error(error.message)
  }

  void captureEvent(
    { name: 'hotel_settings_updated', properties: { area: 'knowledge' } },
    { distinctId: hotelUser.id, propertyId: hotelUser.propertyId }
  )

  revalidateKnowledgePaths()
  return {}
}

export async function deleteKnowledgeEntry(id: string): Promise<ActionResult> {
  const hotelUser = await requireKnowledgeWriteAccess()
  if (!hotelUser) return { error: 'forbidden' }

  const supabase = await createServerClient()
  const { error } = await supabase
    .from('knowledge_chunks')
    .delete()
    .eq('id', id)
    .eq('property_id', hotelUser.propertyId)

  if (error) {
    throw new Error(error.message)
  }

  void captureEvent(
    { name: 'hotel_settings_updated', properties: { area: 'knowledge' } },
    { distinctId: hotelUser.id, propertyId: hotelUser.propertyId }
  )

  revalidateKnowledgePaths()
  return {}
}
