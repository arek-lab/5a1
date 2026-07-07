export const SERVICE_CATEGORIES = [
  'restaurant',
  'room_service',
  'spa',
  'transport',
  'info',
] as const

export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number]
