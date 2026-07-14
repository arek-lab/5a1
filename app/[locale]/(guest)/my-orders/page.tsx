import { headers } from 'next/headers';
import { requireGuestSession } from '@/lib/guest/require-session';
import { withTenantContext } from '@/lib/supabase/tenant';
import { getGuestOrders } from '@/lib/guest/orders';
import { GuestOrdersPanelLoader } from '@/components/guest/guest-orders-panel-loader';

export default async function GuestOrdersPage() {
  const { sessionId } = await requireGuestSession();
  const client = await withTenantContext(await headers());
  const initialOrders = await getGuestOrders(client, sessionId);

  return (
    <main className="px-4 py-6">
      <GuestOrdersPanelLoader initialOrders={initialOrders} />
    </main>
  );
}
