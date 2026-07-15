import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { requireGuestSession } from '@/lib/guest/require-session';
import { withTenantContext } from '@/lib/supabase/tenant';
import { getServicesByCategory } from '@/lib/guest/services';
import { SERVICE_CATEGORIES, type ServiceCategory } from '@/lib/panel/service-categories';
import { ServiceCard } from '@/components/guest/service-card';

function isServiceCategory(value: string): value is ServiceCategory {
  return (SERVICE_CATEGORIES as readonly string[]).includes(value);
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  if (!isServiceCategory(category)) notFound();

  const { propertyId } = await requireGuestSession();
  const client = await withTenantContext(await headers());
  const locale = await getLocale();
  const services = await getServicesByCategory(client, propertyId, category, locale);
  const t = await getTranslations('guest.categories');

  return (
    <main className="flex flex-col gap-2.5 px-4 py-6">
      <Link
        href="/amenities"
        className="flex items-center gap-1 self-end text-sm font-medium text-guest-ink-muted hover:text-guest-ink"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
          <path
            d="M15 5l-7 7 7 7"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {t('back')}
      </Link>
      {services.map(service => (
        <ServiceCard key={service.id} service={service} category={category} />
      ))}
    </main>
  );
}
