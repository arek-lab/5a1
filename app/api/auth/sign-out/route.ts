import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const error = searchParams.get('error')

  const supabase = await createServerClient()
  await supabase.auth.signOut()

  const destination = error ? `/login?error=${encodeURIComponent(error)}` : '/login'
  redirect(destination)
}

export async function POST() {
  const supabase = await createServerClient()
  await supabase.auth.signOut()
  redirect('/login')
}
