import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { computeContentHash } from '@/lib/panel/knowledge-hash'
import type { KbRow, KbSections } from './types'

const CHUNK_CATEGORIES = ['faq', 'local', 'restaurant', 'policies'] as const

function isWithinDateWindow(now: Date, from: string | null, until: string | null): boolean {
  if (from !== null && now < new Date(from)) return false
  if (until !== null && now > new Date(until)) return false
  return true
}

// available_from/available_to are TIME-of-day columns (recurring daily window),
// only meaningful when is_time_sensitive is true — otherwise ignore them entirely.
function isWithinTimeOfDay(current: string, from: string | null, to: string | null): boolean {
  if (from === null && to === null) return true
  if (from !== null && to === null) return current >= from
  if (from === null && to !== null) return current <= to
  if (from! <= to!) return current >= from! && current <= to!
  return current >= from! || current <= to! // overnight span, e.g. 22:00–02:00
}

function currentTimeOfDay(timeZone: string, now: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = part.value
      return acc
    }, {})
  return `${parts.hour}:${parts.minute}:${parts.second}`
}

function formatPrice(priceCents: number, currency: string): string {
  return `${(priceCents / 100).toFixed(2)} ${currency}`
}

function renderServiceContent(service: {
  name: string
  description: string | null
  price_cents: number | null
  currency: string
}): string {
  const priceLine = service.price_cents !== null ? formatPrice(service.price_cents, service.currency) : null
  return [service.name, priceLine, service.description].filter((line): line is string => !!line).join('\n')
}

export async function fetchKbSections(
  client: SupabaseClient<Database>,
  propertyId: string,
  now: Date = new Date()
): Promise<KbSections> {
  const sections: KbSections = {
    faq: [],
    services: [],
    restaurant: [],
    policies: [],
    local: [],
  }

  const { data: property, error: propertyError } = await client
    .from('properties')
    .select('timezone')
    .eq('id', propertyId)
    .single()
  if (propertyError) throw propertyError

  const { data: chunks, error: chunksError } = await client
    .from('knowledge_chunks')
    .select('category, question, content, content_hash, valid_from, valid_until')
    .eq('property_id', propertyId)
    .in('category', CHUNK_CATEGORIES)
    .order('created_at', { ascending: true })
  if (chunksError) throw chunksError

  for (const chunk of chunks ?? []) {
    if (!isWithinDateWindow(now, chunk.valid_from, chunk.valid_until)) continue
    const key = chunk.category as (typeof CHUNK_CATEGORIES)[number]
    sections[key].push({
      question: chunk.question,
      content: chunk.content,
      hash: chunk.content_hash ?? computeContentHash(chunk.content),
    })
  }

  const { data: services, error: servicesError } = await client
    .from('services')
    .select(
      'name, description, price_cents, currency, category, is_time_sensitive, available_from, available_to'
    )
    .eq('property_id', propertyId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
  if (servicesError) throw servicesError

  const timeZone = property?.timezone ?? 'UTC'
  const currentTime = currentTimeOfDay(timeZone, now)

  for (const service of services ?? []) {
    if (service.is_time_sensitive && !isWithinTimeOfDay(currentTime, service.available_from, service.available_to)) {
      continue
    }
    const serialized = [
      service.name,
      service.description ?? '',
      service.price_cents ?? '',
      service.currency,
      service.category,
      service.available_from ?? '',
      service.available_to ?? '',
    ].join('|')
    const row: KbRow = {
      question: null,
      content: renderServiceContent(service),
      hash: computeContentHash(serialized),
    }
    sections.services.push(row)
  }

  return sections
}
