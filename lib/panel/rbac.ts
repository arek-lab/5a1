export type HotelRole = 'owner' | 'admin' | 'staff' | 'viewer'

export type Resource =
  | 'hotel_profile'
  | 'services'
  | 'knowledge'
  | 'qr_manage'
  | 'qr_sessions'
  | 'orders_view'
  | 'orders_status'
  | 'orders_export'
  | 'users'
  | 'dashboard'
  | 'billing'
  | 'transfer_ownership'

export type Permission = 'none' | 'read' | 'write' | 'full'

const PERMISSION_HIERARCHY: Permission[] = ['none', 'read', 'write', 'full']

const PERMISSION_MATRIX: Record<Resource, Record<HotelRole, Permission>> = {
  hotel_profile:      { owner: 'full', admin: 'full', staff: 'read',  viewer: 'read' },
  services:           { owner: 'full', admin: 'full', staff: 'write', viewer: 'read' },
  knowledge:          { owner: 'full', admin: 'full', staff: 'write', viewer: 'read' },
  qr_manage:          { owner: 'full', admin: 'full', staff: 'full',  viewer: 'none' },
  qr_sessions:        { owner: 'full', admin: 'full', staff: 'full',  viewer: 'read' },
  orders_view:        { owner: 'full', admin: 'full', staff: 'full',  viewer: 'read' },
  orders_status:      { owner: 'full', admin: 'full', staff: 'full',  viewer: 'none' },
  orders_export:      { owner: 'full', admin: 'full', staff: 'none',  viewer: 'full' },
  users:              { owner: 'full', admin: 'full', staff: 'none',  viewer: 'none' },
  dashboard:          { owner: 'full', admin: 'full', staff: 'read',  viewer: 'full' },
  billing:            { owner: 'full', admin: 'none', staff: 'none',  viewer: 'none' },
  transfer_ownership: { owner: 'full', admin: 'none', staff: 'none',  viewer: 'none' },
}

export function canPerform(role: HotelRole, resource: Resource, level: Permission): boolean {
  const actual = PERMISSION_MATRIX[resource][role]
  return PERMISSION_HIERARCHY.indexOf(actual) >= PERMISSION_HIERARCHY.indexOf(level)
}
