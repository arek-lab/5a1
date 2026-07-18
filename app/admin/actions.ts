'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { markDpaSigned } from '@/lib/admin/dpa'

export async function markDpaSignedAction(formData: FormData): Promise<void> {
  // Proxy chroni /admin, ale server action to osobny endpoint POST —
  // weryfikujemy token także tutaj, żeby ochrona nie zależała od matchera.
  const cookieStore = await cookies()
  const token = cookieStore.get('admin_token')?.value
  if (!token || token !== process.env.ADMIN_ACCESS_TOKEN) {
    throw new Error('Unauthorized')
  }

  const propertyId = String(formData.get('propertyId') ?? '')
  if (!propertyId) throw new Error('propertyId is required')

  await markDpaSigned(propertyId)
  revalidatePath('/admin')
}
