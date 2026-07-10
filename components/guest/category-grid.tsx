import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ServiceCategory } from '@/lib/panel/service-categories';

const CATEGORY_ICON: Record<ServiceCategory, string> = {
  restaurant: '🍽️',
  room_service: '🛎️',
  spa: '💆',
  transport: '🚗',
  info: 'ℹ️',
};

export function CategoryGrid({ visibleCategories }: { visibleCategories: ServiceCategory[] }) {
  const t = useTranslations('guest.categories');

  return (
    <div className="grid grid-cols-2 gap-3 px-4 sm:grid-cols-3">
      {visibleCategories.map(category => (
        <Link
          key={category}
          href={`/c/${category}`}
          className="flex flex-col items-center gap-2 rounded-lg border bg-white px-3 py-6 text-center text-gray-900 hover:bg-gray-50"
        >
          <span aria-hidden="true" className="text-3xl">{CATEGORY_ICON[category]}</span>
          <span className="text-sm font-medium">{t(category)}</span>
        </Link>
      ))}
    </div>
  );
}
