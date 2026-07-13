import { headers } from 'next/headers';
import { getLocale } from 'next-intl/server';
import { requireGuestSession } from '@/lib/guest/require-session';
import { withTenantContext } from '@/lib/supabase/tenant';
import { getPinnedServices, getVisibleCategories } from '@/lib/guest/services';
import { SplashScreen } from '@/components/guest/splash-screen';
import { WelcomeBanner } from '@/components/guest/welcome-banner';
import { CategoryGrid } from '@/components/guest/category-grid';
import { PolecamySection } from '@/components/guest/polecamy-section';

export default async function GuestHomePage() {
  const { guestFirstName, roomNumber, propertyId, sessionId, propertyName } = await requireGuestSession();

  const client = await withTenantContext(await headers());
  const locale = await getLocale();
  const [services, visibleCategories] = await Promise.all([
    getPinnedServices(client, propertyId, locale),
    getVisibleCategories(client, propertyId),
  ]);

  return (
    <>
      <SplashScreen />
      <main>
        <WelcomeBanner guestFirstName={guestFirstName} roomNumber={roomNumber} />
        <CategoryGrid visibleCategories={visibleCategories} />
        <PolecamySection services={services} sessionId={sessionId} hotelName={propertyName} />
      </main>
    </>
  );
}
