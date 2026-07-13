import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { fetchKbSections } from './fetch'
import { computeCompositeHash } from './hash'
import { renderKbMarkdown } from './render'
import type { KbSections } from './types'

export async function composeKb(
  client: SupabaseClient<Database>,
  propertyId: string
): Promise<{ sections: KbSections; hash: string; markdown: string }> {
  const sections = await fetchKbSections(client, propertyId)
  const hash = computeCompositeHash(sections)
  const markdown = renderKbMarkdown(sections)
  return { sections, hash, markdown }
}
