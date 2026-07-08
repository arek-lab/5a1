import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export async function POST(): Promise<NextResponse> {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !user.email) {
    return new NextResponse(null, { status: 401 })
  }

  const { error } = await createServiceRoleClient()
    .from('hotel_users')
    .update({ auth_user_id: user.id, status: 'active', invite_token: null })
    .eq('email', user.email)
    .eq('status', 'invited')

  if (error) {
    return new NextResponse(null, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
