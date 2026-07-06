import { NextRequest, NextResponse } from 'next/server'
import { processEarlyCheckout } from '@/lib/checkout/early-checkout'

// TODO(S2.1): add RBAC guard — only owner/admin/staff may trigger early checkout
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params
  try {
    await processEarlyCheckout(id)
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.startsWith('reservation_not_found')) {
      return NextResponse.json({ error: 'reservation_not_found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
