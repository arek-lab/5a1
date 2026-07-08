import { createServerClient } from '@/lib/supabase/server'
import AcceptForm from './accept-form'

interface Props {
  searchParams: Promise<{ error_code?: string }>
}

export default async function AcceptInvitePage({ searchParams }: Props) {
  const { error_code: errorCode } = await searchParams
  if (errorCode === 'otp_expired') {
    return <ExpiredInvite />
  }

  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return <ExpiredInvite />
  }

  return <AcceptForm />
}

function ExpiredInvite() {
  return (
    <div>
      <h1>This invitation has expired</h1>
      <p>Ask an Owner or Admin to resend your invite from the users list.</p>
    </div>
  )
}
