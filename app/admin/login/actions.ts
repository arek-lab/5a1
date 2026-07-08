'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export async function login(formData: FormData): Promise<{ error?: string }> {
  const token = String(formData.get('token') ?? '')
  if (!token || token !== process.env.ADMIN_ACCESS_TOKEN) {
    return { error: 'Invalid token' }
  }

  const cookieStore = await cookies()
  cookieStore.set('admin_token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
  })

  redirect('/admin')
}
