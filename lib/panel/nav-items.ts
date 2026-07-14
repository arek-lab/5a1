import { canPerform, type HotelRole, type Resource } from './rbac'

export interface NavItem {
  href: string
  labelKey: string
  resource: Resource
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', labelKey: 'dashboard', resource: 'dashboard' },
  { href: '/services', labelKey: 'services', resource: 'services' },
  { href: '/knowledge', labelKey: 'knowledge', resource: 'knowledge' },
  { href: '/qr', labelKey: 'qr', resource: 'qr_manage' },
  { href: '/orders', labelKey: 'orders', resource: 'orders_view' },
  { href: '/users', labelKey: 'users', resource: 'users' },
]

export function getVisibleNavItems(role: HotelRole): NavItem[] {
  return NAV_ITEMS.filter((item) => canPerform(role, item.resource, 'read'))
}
