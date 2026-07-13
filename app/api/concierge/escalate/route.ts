import { NextRequest, NextResponse } from 'next/server'
import { withTenantContext } from '@/lib/supabase/tenant'
import { captureEvent } from '@/lib/analytics/capture'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
    .select('id, auth_level, property_id')
    .eq('id', sessionId)
    .single()

  if (!session || session.auth_level < 1) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  await captureEvent(
    { name: 'concierge_response_escalated', properties: { reason: 'streak' } },
    { distinctId: sessionId, propertyId: session.property_id }
  )

  return new NextResponse(null, { status: 204 })
}
