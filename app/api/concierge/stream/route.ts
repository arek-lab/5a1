import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import type { Stream } from 'openai/core/streaming'
import type { ChatCompletionChunk } from 'openai/resources/chat/completions'
import { withTenantContext } from '@/lib/supabase/tenant'
import { getOrComposeKb } from '@/lib/kb/cache'
import { checkConciergeRateLimit } from '@/lib/rate-limit/concierge'
import { buildSystemPrompt } from '@/lib/concierge/system-prompt'
import { buildConciergeMessages, type ConciergeTurn } from '@/lib/concierge/payload'
import { lookupCachedAnswer } from '@/lib/concierge/semantic-cache'
import { getOpenAIClient } from '@/lib/concierge/openai-client'
import { captureEvent } from '@/lib/analytics/capture'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SLOW_RESPONSE_THRESHOLD_MS = 5000

export async function POST(request: NextRequest): Promise<NextResponse | Response> {
  const sessionId = request.headers.get('x-session-id')
  if (!sessionId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let client
  try {
    client = await withTenantContext(request.headers)
  } catch {
    return NextResponse.json({ error: 'invalid_property' }, { status: 400 })
  }

  const { data: session } = await client
    .from('sessions')
    .select('id, auth_level, property_id')
    .eq('id', sessionId)
    .single()

  if (!session || session.auth_level < 1) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const propertyId = session.property_id

  const rateLimit = await checkConciergeRateLimit(sessionId)
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  const body = await request.json().catch(() => null)
  const question = body?.question
  if (typeof question !== 'string' || question.trim().length === 0) {
    return NextResponse.json({ error: 'invalid_question' }, { status: 400 })
  }
  const history: ConciergeTurn[] = Array.isArray(body?.history) ? body.history : []

  const encoder = new TextEncoder()
  const startedAt = Date.now()
  let openaiStream: Stream<ChatCompletionChunk> | undefined

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
      }

      try {
        await lookupCachedAnswer(propertyId, question)

        const { markdown: kbMarkdown } = await getOrComposeKb(request.headers)
        const systemPrompt = buildSystemPrompt()
        const messages = buildConciergeMessages({
          systemPrompt,
          kbMarkdown,
          history: [...history, { role: 'user', content: question }],
        })

        const openai = getOpenAIClient()
        openaiStream = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages,
          stream: true,
        })

        let fullAnswer = ''
        for await (const chunk of openaiStream) {
          const delta = chunk.choices[0]?.delta?.content ?? ''
          if (delta) {
            fullAnswer += delta
            send({ type: 'chunk', text: delta })
          }
        }

        send({ type: 'done' })
        controller.close()

        const latencyMs = Date.now() - startedAt
        if (latencyMs > SLOW_RESPONSE_THRESHOLD_MS) {
          Sentry.captureMessage('concierge_response_slow', {
            level: 'warning',
            extra: { session_id: sessionId, latency_ms: latencyMs },
          })
        }

        const confidence = fullAnswer.startsWith('[FALLBACK]') ? 0 : 1
        await captureEvent(
          { name: 'concierge_response_delivered', properties: { confidence, latency_ms: latencyMs } },
          { distinctId: sessionId, propertyId }
        )
      } catch (error) {
        Sentry.captureException(error)
        try {
          send({ type: 'error', fallback: true })
        } catch {
          // stream already closed
        }
        controller.close()
      }
    },
    cancel() {
      openaiStream?.controller.abort()
    },
  })

  request.signal.addEventListener('abort', () => {
    openaiStream?.controller.abort()
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
