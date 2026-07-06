import { redirect } from 'next/navigation'
import { canPerform } from '@/lib/panel/rbac'
import type { HotelRole, Resource, Permission } from '@/lib/panel/rbac'

interface Props {
  role: HotelRole
  resource: Resource
  level: Permission
  children: React.ReactNode
}

export default function RequirePermission({ role, resource, level, children }: Props) {
  if (!canPerform(role, resource, level)) {
    redirect('/unauthorized')
  }
  return <>{children}</>
}
