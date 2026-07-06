import { redirect } from 'next/navigation'
import { getHotelUser } from '@/lib/panel/auth'
import LoginForm from './login-form'

interface Props {
  searchParams: Promise<{ error?: string }>
}

export default async function LoginPage({ searchParams }: Props) {
  const hotelUser = await getHotelUser()
  if (hotelUser) redirect('/dashboard')

  const { error } = await searchParams
  return <LoginForm initialError={error ?? null} />
}
