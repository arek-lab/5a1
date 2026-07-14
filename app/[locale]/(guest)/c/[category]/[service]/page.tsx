import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { requireGuestSession } from '@/lib/guest/require-session';
import { withTenantContext } from '@/lib/supabase/tenant';
import { getServiceById } from '@/lib/guest/services';
import { SERVICE_CATEGORIES, type ServiceCategory } from '@/lib/panel/service-categories';
import { OrderCta, type GuestOrderContext } from '@/components/guest/order-cta';

function isServiceCategory(value: string): value is ServiceCategory {
  return (SERVICE_CATEGORIES as readonly string[]).includes(value);
}

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ category: string; service: string }>;
}) {
  const { category, service: serviceId } = await params;
  if (!isServiceCategory(category)) notFound();

  const { propertyId, sessionId, roomId, reservationId, phoneReception } = await requireGuestSession();
  const client = await withTenantContext(await headers());
  const locale = await getLocale();
  const service = await getServiceById(client, propertyId, serviceId, locale);

  if (!service || !service.isActive || service.category !== category) notFound();

  const guestContext: GuestOrderContext = { propertyId, sessionId, roomId, reservationId, phoneReception };
  const t = await getTranslations('guest.service');
  const price = service.priceCents === null ? t('included') : (service.priceCents / 100).toFixed(2);

  return (
    <main className="space-y-4 px-4 py-6">
      {service.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={service.imageUrl} alt="" className="h-48 w-full rounded-lg object-cover" />
      )}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{service.name}</h1>
        <p className="mt-1 text-sm text-gray-600">{price}</p>
      </div>
      {service.description && <p className="text-gray-700">{service.description}</p>}
      <OrderCta service={service} guestContext={guestContext} />
    </main>
  );
}
