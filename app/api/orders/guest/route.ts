import { NextRequest, NextResponse } from 'next/server'
import { withTenantContext } from '@/lib/supabase/tenant'
import { getGuestOrders } from '@/lib/guest/orders'

export async function GET(request: NextRequest): Promise<NextResponse> {
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
    .select('id, auth_level')
    .eq('id', sessionId)
    .single()

  if (!session || session.auth_level < 1) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const orders = await getGuestOrders(client, sessionId)

  return NextResponse.json({ orders })
}
