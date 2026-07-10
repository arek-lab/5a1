import { redirect } from 'next/navigation'
import { getHotelUser } from '@/lib/panel/auth'
import SignupForm from './signup-form'

export default async function SignupPage() {
  const hotelUser = await getHotelUser()
  if (hotelUser) redirect('/dashboard')

  return <SignupForm />
}
