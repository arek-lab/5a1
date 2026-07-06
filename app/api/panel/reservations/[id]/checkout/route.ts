import { NextRequest, NextResponse } from 'next/server'
import { processEarlyCheckout } from '@/lib/checkout/early-checkout'
import { getHotelUser } from '@/lib/panel/auth'
import { canPerform } from '@/lib/panel/rbac'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const hotelUser = await getHotelUser()
  if (!hotelUser) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!canPerform(hotelUser.role, 'qr_manage', 'full')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

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
