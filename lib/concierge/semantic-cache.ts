// Deferred design (HITL decision, s4-2 planning): OpenAI `text-embedding-3-small`
// + an Upstash Vector index scoped by property_id, ~0.93 cosine-similarity threshold.
// Stubbed as an always-miss no-op so the route never depends on this being implemented.

export async function lookupCachedAnswer(
  propertyId: string,
  question: string
): Promise<string | null> {
  void propertyId
  void question
  return null
}

export async function storeCachedAnswer(
  propertyId: string,
  question: string,
  answer: string
): Promise<void> {
  void propertyId
  void question
  void answer
}
