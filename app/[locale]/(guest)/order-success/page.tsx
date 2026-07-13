import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireGuestSession } from '@/lib/guest/require-session';
import { withTenantContext } from '@/lib/supabase/tenant';

export default async function OrderSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>;
}) {
  const { orderId } = await searchParams;
  if (!orderId) notFound();

  await requireGuestSession();
  const client = await withTenantContext(await headers());

  const { data: order } = await client
    .from('orders')
    .select('id, note, scheduled_at, service_id')
    .eq('id', orderId)
    .maybeSingle();

  if (!order) notFound();

  const { data: service } = await client
    .from('services')
    .select('name')
    .eq('id', order.service_id)
    .maybeSingle();

  const t = await getTranslations('guest.orderSuccess');

  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-4 py-6 text-center">
      <h1 className="text-2xl font-semibold text-gray-900">{t('title')}</h1>
      <p className="text-gray-700">{service?.name}</p>
      <p className="text-sm font-medium text-gray-500">{t('status')}</p>
      <div className="mt-4 flex w-full max-w-sm flex-col gap-2">
        <Link
          href="/orders"
          className="rounded-full bg-gray-900 px-6 py-3 text-base font-semibold text-white hover:bg-gray-700"
        >
          {t('ordersLink')}
        </Link>
        <Link
          href="/"
          className="rounded-full border px-6 py-3 text-base font-semibold text-gray-700 hover:bg-gray-50"
        >
          {t('backToServices')}
        </Link>
      </div>
    </main>
  );
}
