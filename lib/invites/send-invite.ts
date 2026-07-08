import { createServiceRoleClient } from '@/lib/supabase/service-role'

export async function sendInviteEmail(
  email: string,
  redirectTo: string
): Promise<{ error?: string }> {
  const { error } = await createServiceRoleClient().auth.admin.inviteUserByEmail(email, {
    redirectTo,
  })
  if (error) return { error: error.message }
  return {}
}
