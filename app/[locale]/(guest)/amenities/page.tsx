import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { requireGuestSession } from '@/lib/guest/require-session';
import { withTenantContext } from '@/lib/supabase/tenant';
import { getVisibleCategories } from '@/lib/guest/services';
import { CategoryGrid } from '@/components/guest/category-grid';

export default async function AmenitiesPage() {
  const { propertyId } = await requireGuestSession();
  const client = await withTenantContext(await headers());
  const t = await getTranslations('guest.amenities');

  const visibleCategories = await getVisibleCategories(client, propertyId);

  return (
    <main>
      <h1 className="px-4 py-4 font-display text-xl font-semibold text-guest-ink">{t('title')}</h1>
      <CategoryGrid visibleCategories={visibleCategories} />
    </main>
  );
}
