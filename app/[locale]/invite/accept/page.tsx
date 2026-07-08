import AcceptGate from './accept-gate'
import ExpiredInvite from './expired-invite'

interface Props {
  searchParams: Promise<{ error_code?: string }>
}

export default async function AcceptInvitePage({ searchParams }: Props) {
  const { error_code: errorCode } = await searchParams
  if (errorCode === 'otp_expired') {
    return <ExpiredInvite />
  }

  return <AcceptGate />
}
