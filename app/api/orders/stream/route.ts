import { NextRequest, NextResponse } from 'next/server'
import { getHotelUser } from '@/lib/panel/auth'
import { canPerform } from '@/lib/panel/rbac'
import { subscribeToOrderChanges } from '@/lib/orders/listener'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HEARTBEAT_INTERVAL_MS = 20_000

export async function GET(request: NextRequest): Promise<NextResponse | Response> {
  const hotelUser = await getHotelUser()
  if (!hotelUser) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!canPerform(hotelUser.role, 'orders_view', 'read')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const propertyId = hotelUser.propertyId
  const encoder = new TextEncoder()

  let unsubscribe: (() => void) | undefined
  let heartbeat: ReturnType<typeof setInterval> | undefined

  const stream = new ReadableStream({
    start(controller) {
      unsubscribe = subscribeToOrderChanges(propertyId, (order) => {
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
