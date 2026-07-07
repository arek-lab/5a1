import type { ServiceCategory } from './service-categories'

export type ServiceTemplate = {
  key: string
  category: ServiceCategory
  nameKey: string
  descriptionKey: string
  suggestedPriceCents: number | null
}

export const SERVICE_TEMPLATES: ServiceTemplate[] = [
  {
    key: 'breakfast_in_room',
    category: 'restaurant',
    nameKey: 'serviceTemplates.breakfast_in_room.name',
    descriptionKey: 'serviceTemplates.breakfast_in_room.description',
    suggestedPriceCents: 4500,
  },
  {
    key: 'dinner_a_la_carte',
    category: 'restaurant',
    nameKey: 'serviceTemplates.dinner_a_la_carte.name',
    descriptionKey: 'serviceTemplates.dinner_a_la_carte.description',
    suggestedPriceCents: 8000,
  },
  {
    key: 'minibar_restock',
    category: 'restaurant',
    nameKey: 'serviceTemplates.minibar_restock.name',
    descriptionKey: 'serviceTemplates.minibar_restock.description',
    suggestedPriceCents: 3000,
  },
  {
    key: 'room_service_snacks',
    category: 'restaurant',
    nameKey: 'serviceTemplates.room_service_snacks.name',
    descriptionKey: 'serviceTemplates.room_service_snacks.description',
    suggestedPriceCents: 2500,
  },
  {
    key: 'daily_cleaning',
    category: 'room_service',
    nameKey: 'serviceTemplates.daily_cleaning.name',
    descriptionKey: 'serviceTemplates.daily_cleaning.description',
    suggestedPriceCents: null,
  },
  {
    key: 'extra_towels',
    category: 'room_service',
    nameKey: 'serviceTemplates.extra_towels.name',
    descriptionKey: 'serviceTemplates.extra_towels.description',
    suggestedPriceCents: 0,
  },
  {
    key: 'laundry',
    category: 'room_service',
    nameKey: 'serviceTemplates.laundry.name',
    descriptionKey: 'serviceTemplates.laundry.description',
    suggestedPriceCents: 6000,
  },
  {
    key: 'ironing_service',
    category: 'room_service',
    nameKey: 'serviceTemplates.ironing_service.name',
    descriptionKey: 'serviceTemplates.ironing_service.description',
    suggestedPriceCents: 2000,
  },
  {
    key: 'massage',
    category: 'spa',
    nameKey: 'serviceTemplates.massage.name',
    descriptionKey: 'serviceTemplates.massage.description',
    suggestedPriceCents: 15000,
  },
  {
    key: 'sauna_session',
    category: 'spa',
    nameKey: 'serviceTemplates.sauna_session.name',
    descriptionKey: 'serviceTemplates.sauna_session.description',
    suggestedPriceCents: 5000,
  },
  {
    key: 'pool_access',
    category: 'spa',
    nameKey: 'serviceTemplates.pool_access.name',
    descriptionKey: 'serviceTemplates.pool_access.description',
    suggestedPriceCents: null,
  },
  {
    key: 'yoga_class',
    category: 'spa',
    nameKey: 'serviceTemplates.yoga_class.name',
    descriptionKey: 'serviceTemplates.yoga_class.description',
    suggestedPriceCents: 4000,
  },
  {
    key: 'airport_transfer',
    category: 'transport',
    nameKey: 'serviceTemplates.airport_transfer.name',
    descriptionKey: 'serviceTemplates.airport_transfer.description',
    suggestedPriceCents: 12000,
  },
  {
    key: 'bike_rental',
    category: 'transport',
    nameKey: 'serviceTemplates.bike_rental.name',
    descriptionKey: 'serviceTemplates.bike_rental.description',
    suggestedPriceCents: 3500,
  },
  {
    key: 'car_rental',
    category: 'transport',
    nameKey: 'serviceTemplates.car_rental.name',
    descriptionKey: 'serviceTemplates.car_rental.description',
    suggestedPriceCents: 25000,
  },
  {
    key: 'taxi_booking',
    category: 'transport',
    nameKey: 'serviceTemplates.taxi_booking.name',
    descriptionKey: 'serviceTemplates.taxi_booking.description',
    suggestedPriceCents: null,
  },
  {
    key: 'early_checkin',
    category: 'info',
    nameKey: 'serviceTemplates.early_checkin.name',
    descriptionKey: 'serviceTemplates.early_checkin.description',
    suggestedPriceCents: 5000,
  },
  {
    key: 'late_checkout',
    category: 'info',
    nameKey: 'serviceTemplates.late_checkout.name',
    descriptionKey: 'serviceTemplates.late_checkout.description',
    suggestedPriceCents: 5000,
  },
  {
    key: 'luggage_storage',
    category: 'info',
    nameKey: 'serviceTemplates.luggage_storage.name',
    descriptionKey: 'serviceTemplates.luggage_storage.description',
    suggestedPriceCents: 0,
  },
  {
    key: 'city_tour_info',
    category: 'info',
    nameKey: 'serviceTemplates.city_tour_info.name',
    descriptionKey: 'serviceTemplates.city_tour_info.description',
    suggestedPriceCents: null,
  },
]
