import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

function isWithinDateWindow(now: Date, from: string | null, until: string | null): boolean {
  if (from !== null && now < new Date(from)) return false
  if (until !== null && now > new Date(until)) return false
  return true
}

export async function getLocalAreaContent(
  client: SupabaseClient<Database>,
  propertyId: string,
  now: Date = new Date()
): Promise<{ question: string | null; content: string }[]> {
  const { data: chunks, error } = await client
    .from('knowledge_chunks')
    .select('question, content, valid_from, valid_until')
    .eq('property_id', propertyId)
    .eq('category', 'local')
    .order('created_at', { ascending: true })
  if (error) throw error

  return (chunks ?? [])
    .filter((chunk) => isWithinDateWindow(now, chunk.valid_from, chunk.valid_until))
    .map((chunk) => ({ question: chunk.question, content: chunk.content }))
}
