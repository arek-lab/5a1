export type ConciergeTurn = { role: 'user' | 'assistant'; content: string }

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

const MAX_HISTORY_TURNS = 10

function isValidTurn(turn: unknown): turn is ConciergeTurn {
  if (typeof turn !== 'object' || turn === null) return false
  const candidate = turn as Record<string, unknown>
  return (
    (candidate.role === 'user' || candidate.role === 'assistant') &&
    typeof candidate.content === 'string'
  )
}

// Structurally limited to system prompt + KB markdown + client-supplied free-text
// turns — there is no field here a guest/reservation attribute could enter through.
export function buildConciergeMessages({
  systemPrompt,
  kbMarkdown,
  history,
}: {
  systemPrompt: string
  kbMarkdown: string
  history: ConciergeTurn[]
}): ChatMessage[] {
  const validTurns = history.filter(isValidTurn).slice(-MAX_HISTORY_TURNS)

  return [
    { role: 'system', content: `${systemPrompt}\n\nHOTEL KB:\n${kbMarkdown}` },
    ...validTurns.map((turn) => ({ role: turn.role, content: turn.content })),
  ]
}
