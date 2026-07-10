import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
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
  const services = await getServicesByCategory(client, propertyId, category);

  return (
    <main className="grid grid-cols-2 gap-3 px-4 py-6 sm:grid-cols-3">
      {services.map(service => (
        <ServiceCard key={service.id} service={service} category={category} />
      ))}
    </main>
  );
}
