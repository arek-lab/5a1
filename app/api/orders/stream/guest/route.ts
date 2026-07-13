import { NextRequest, NextResponse } from 'next/server'
import { withTenantContext } from '@/lib/supabase/tenant'
import { subscribeToOrderChanges } from '@/lib/orders/listener'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HEARTBEAT_INTERVAL_MS = 20_000

export async function GET(request: NextRequest): Promise<NextResponse | Response> {
  const sessionId = request.headers.get('x-session-id')
  if (!sessionId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let client
  try {
    client = await withTenantContext(request.headers)
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { data: session } = await client
    .from('sessions')
    .select('id, property_id, auth_level')
    .eq('id', sessionId)
    .single()

  if (!session || session.auth_level < 1) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const propertyId = session.property_id
  const encoder = new TextEncoder()

  let unsubscribe: (() => void) | undefined
  let heartbeat: ReturnType<typeof setInterval> | undefined

  const stream = new ReadableStream({
    start(controller) {
      unsubscribe = subscribeToOrderChanges(propertyId, (order) => {
        if (order.session_id !== sessionId) return
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(order)}\n\n`))
      })
      heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(': ping\n\n'))
      }, HEARTBEAT_INTERVAL_MS)
    },
    cancel() {
      unsubscribe?.()
      if (heartbeat) clearInterval(heartbeat)
    },
  })

  request.signal.addEventListener('abort', () => {
    unsubscribe?.()
    if (heartbeat) clearInterval(heartbeat)
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
