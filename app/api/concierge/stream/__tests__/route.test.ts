import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockWithTenantContext = vi.fn()
vi.mock('@/lib/supabase/tenant', () => ({
  withTenantContext: (...args: unknown[]) => mockWithTenantContext(...args),
}))

const mockCheckConciergeRateLimit = vi.fn()
vi.mock('@/lib/rate-limit/concierge', () => ({
  checkConciergeRateLimit: (...args: unknown[]) => mockCheckConciergeRateLimit(...args),
}))

const mockGetOrComposeKb = vi.fn()
vi.mock('@/lib/kb/cache', () => ({
  getOrComposeKb: (...args: unknown[]) => mockGetOrComposeKb(...args),
}))

const mockLookupCachedAnswer = vi.fn()
vi.mock('@/lib/concierge/semantic-cache', () => ({
  lookupCachedAnswer: (...args: unknown[]) => mockLookupCachedAnswer(...args),
  storeCachedAnswer: vi.fn(),
}))

const mockCreate = vi.fn()
vi.mock('@/lib/concierge/openai-client', () => ({
  getOpenAIClient: () => ({ chat: { completions: { create: mockCreate } } }),
}))

const mockCaptureEvent = vi.fn()
vi.mock('@/lib/analytics/capture', () => ({
  captureEvent: (...args: unknown[]) => mockCaptureEvent(...args),
}))

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}))

import { POST } from '../route'

function jsonRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/concierge/stream', {
    method: 'POST',
    headers: { 'x-session-id': 'session-1', 'x-property-id': 'prop-1', ...headers },
    body: JSON.stringify(body),
  })
}

type Session = { id: string; auth_level: number; property_id: string }

function makeClient(session: Session | null) {
  const sessionBuilder = {
    select: vi.fn(() => sessionBuilder),
    eq: vi.fn(() => sessionBuilder),
    single: vi.fn(async () => ({ data: session, error: null })),
  }
  return { from: vi.fn(() => sessionBuilder) }
}

function makeOpenAIStream(chunks: string[]) {
  const abort = vi.fn()
  return {
    controller: { abort },
    async *[Symbol.asyncIterator]() {
      for (const text of chunks) {
        yield { choices: [{ delta: { content: text } }] }
      }
    },
  }
}

async function readSseFrames(response: Response): Promise<Array<Record<string, unknown>>> {
  const text = await response.text()
  return text
    .split('\n\n')
    .filter((chunk) => chunk.startsWith('data: '))
    .map((chunk) => JSON.parse(chunk.slice('data: '.length)))
}

describe('POST /api/concierge/stream', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockGetOrComposeKb.mockResolvedValue({ markdown: 'KB markdown', hash: 'h1', cacheHit: false })
    mockLookupCachedAnswer.mockResolvedValue(null)
    mockCheckConciergeRateLimit.mockResolvedValue({ allowed: true, remaining: 5, retryAfter: 0 })
  })

  it('returns 401 when x-session-id header is missing', async () => {
    const response = await POST(jsonRequest({ question: 'hi' }, { 'x-session-id': '' }) as never)
    expect(response.status).toBe(401)
    expect(mockWithTenantContext).not.toHaveBeenCalled()
  })

  it('returns 400 when the property header is invalid', async () => {
    mockWithTenantContext.mockRejectedValue(new Error('Missing or invalid x-property-id header'))

    const response = await POST(jsonRequest({ question: 'hi' }) as never)

    expect(response.status).toBe(400)
  })

  it('returns 401 when the session does not exist or auth_level < 1, without calling OpenAI', async () => {
    mockWithTenantContext.mockResolvedValue(makeClient(null))

    const response = await POST(jsonRequest({ question: 'hi' }) as never)

    expect(response.status).toBe(401)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('returns 429 when rate-limited, without calling OpenAI', async () => {
    mockWithTenantContext.mockResolvedValue(
      makeClient({ id: 'session-1', auth_level: 1, property_id: 'prop-1' })
    )
    mockCheckConciergeRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfter: 30 })

    const response = await POST(jsonRequest({ question: 'hi' }) as never)

    expect(response.status).toBe(429)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('returns 400 when question is missing or blank', async () => {
    mockWithTenantContext.mockResolvedValue(
      makeClient({ id: 'session-1', auth_level: 1, property_id: 'prop-1' })
    )

    const response = await POST(jsonRequest({ question: '  ' }) as never)

    expect(response.status).toBe(400)
  })

  it('streams chunks in order then a done event, and records the analytics event', async () => {
    mockWithTenantContext.mockResolvedValue(
      makeClient({ id: 'session-1', auth_level: 1, property_id: 'prop-1' })
    )
    mockCreate.mockResolvedValue(makeOpenAIStream(['Hello', ' world']))

    const response = await POST(jsonRequest({ question: 'What time is breakfast?' }) as never)

    expect(response.headers.get('Content-Type')).toBe('text/event-stream')
    const frames = await readSseFrames(response)
    expect(frames).toEqual([
      { type: 'chunk', text: 'Hello' },
      { type: 'chunk', text: ' world' },
      { type: 'done' },
    ])
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      { name: 'concierge_response_delivered', properties: { confidence: 1, latency_ms: expect.any(Number) } },
      { distinctId: 'session-1', propertyId: 'prop-1' }
    )
  })

  it('fires concierge_response_escalated with reason complaint for an [ESCALATE]-prefixed answer', async () => {
    mockWithTenantContext.mockResolvedValue(
      makeClient({ id: 'session-1', auth_level: 1, property_id: 'prop-1' })
    )
    mockCreate.mockResolvedValue(makeOpenAIStream(['[ESCALATE]', ' Łączymy z recepcją.']))

    const response = await POST(jsonRequest({ question: 'Mam reklamację' }) as never)
    await readSseFrames(response)

    expect(mockCaptureEvent).toHaveBeenCalledWith(
      { name: 'concierge_response_delivered', properties: { confidence: 0, latency_ms: expect.any(Number) } },
      { distinctId: 'session-1', propertyId: 'prop-1' }
    )
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      { name: 'concierge_response_escalated', properties: { reason: 'complaint' } },
      { distinctId: 'session-1', propertyId: 'prop-1' }
    )
  })

  it('does not fire concierge_response_escalated for a normal answer', async () => {
    mockWithTenantContext.mockResolvedValue(
      makeClient({ id: 'session-1', auth_level: 1, property_id: 'prop-1' })
    )
    mockCreate.mockResolvedValue(makeOpenAIStream(['Breakfast is at 8am.']))

    const response = await POST(jsonRequest({ question: 'What time is breakfast?' }) as never)
    await readSseFrames(response)

    expect(mockCaptureEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: 'concierge_response_escalated' }),
      expect.anything()
    )
  })

  it('does not fire concierge_response_escalated for a [FALLBACK]-prefixed answer', async () => {
    mockWithTenantContext.mockResolvedValue(
      makeClient({ id: 'session-1', auth_level: 1, property_id: 'prop-1' })
    )
    mockCreate.mockResolvedValue(makeOpenAIStream(['[FALLBACK]', ' Nie mam tej informacji.']))

    const response = await POST(jsonRequest({ question: 'Random question' }) as never)
    await readSseFrames(response)

    expect(mockCaptureEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: 'concierge_response_escalated' }),
      expect.anything()
    )
  })

  it('emits a single error event and closes cleanly when the OpenAI call throws mid-stream', async () => {
    mockWithTenantContext.mockResolvedValue(
      makeClient({ id: 'session-1', auth_level: 1, property_id: 'prop-1' })
    )
    mockCreate.mockRejectedValue(new Error('boom'))

    const response = await POST(jsonRequest({ question: 'hi' }) as never)

    const frames = await readSseFrames(response)
    expect(frames).toEqual([{ type: 'error', fallback: true }])
    expect(mockCaptureEvent).not.toHaveBeenCalled()
  })

  it('composes messages containing only system prompt + KB markdown + history strings (PII guard)', async () => {
    mockWithTenantContext.mockResolvedValue(
      makeClient({ id: 'session-1', auth_level: 1, property_id: 'prop-1' })
    )
    mockCreate.mockResolvedValue(makeOpenAIStream(['ok']))

    const response = await POST(
      jsonRequest({
        question: 'What time is breakfast?',
        history: [{ role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Hello!' }],
      }) as never
    )
    await readSseFrames(response)

    expect(mockCreate).toHaveBeenCalledTimes(1)
    const [callArgs] = mockCreate.mock.calls[0]
    expect(callArgs.model).toBe('gpt-4o-mini')
    expect(callArgs.stream).toBe(true)
    for (const message of callArgs.messages) {
      expect(Object.keys(message).sort()).toEqual(['content', 'role'])
      expect(typeof message.content).toBe('string')
    }
    expect(callArgs.messages[0].role).toBe('system')
    expect(callArgs.messages[0].content).toContain('KB markdown')
    expect(callArgs.messages.at(-1)).toEqual({ role: 'user', content: 'What time is breakfast?' })
  })
})
