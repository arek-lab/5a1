import { NextRequest, NextResponse } from 'next/server'
import { withTenantContext } from '@/lib/supabase/tenant'
import { buildScheduledAt } from '@/lib/guest/scheduled-at'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const NOTE_MAX_LENGTH = 500

export async function POST(request: NextRequest): Promise<NextResponse> {
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
    .select('id, auth_level, property_id, room_id, reservation_id')
    .eq('id', sessionId)
    .single()

  if (!session || session.auth_level < 1) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)

  const serviceId = body?.serviceId
  if (typeof serviceId !== 'string' || !UUID_RE.test(serviceId)) {
    return NextResponse.json({ error: 'invalid_service' }, { status: 400 })
  }

  const note = body?.note
  if (note !== undefined && (typeof note !== 'string' || note.length > NOTE_MAX_LENGTH)) {
    return NextResponse.json({ error: 'invalid_note' }, { status: 400 })
  }

  const scheduledTime = body?.scheduledTime
  if (scheduledTime !== undefined && (typeof scheduledTime !== 'string' || !TIME_RE.test(scheduledTime))) {
    return NextResponse.json({ error: 'invalid_scheduled_time' }, { status: 400 })
  }

  const { data: service } = await client
    .from('services')
    .select('id, price_cents, is_active')
    .eq('id', serviceId)
    .eq('property_id', session.property_id)
    .maybeSingle()

  if (!service || !service.is_active) {
    return NextResponse.json({ error: 'service_unavailable' }, { status: 404 })
  }

  let scheduledAt: string | null = null
  if (scheduledTime) {
    const { data: property } = await client
      .from('properties')
      .select('timezone')
      .eq('id', session.property_id)
      .single()
    scheduledAt = buildScheduledAt(property?.timezone ?? 'UTC', scheduledTime)
  }

  const { data: order, error } = await client
    .from('orders')
    .insert({
      property_id: session.property_id,
      session_id: session.id,
      reservation_id: session.reservation_id,
      room_id: session.room_id,
      service_id: service.id,
      price_cents: service.price_cents,
      note: note?.trim() || null,
      scheduled_at: scheduledAt,
    })
    .select('id')
    .single()

  if (error || !order) {
    return NextResponse.json({ error: 'insert_failed' }, { status: 500 })
  }

  return NextResponse.json({ orderId: order.id }, { status: 201 })
}
