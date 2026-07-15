import { headers } from 'next/headers';
import { getLocale } from 'next-intl/server';
import { requireGuestSession } from '@/lib/guest/require-session';
import { withTenantContext } from '@/lib/supabase/tenant';
import { getPinnedServices } from '@/lib/guest/services';
import { SplashScreen } from '@/components/guest/splash-screen';
import { HeroImage } from '@/components/guest/hero-image';
import { WelcomeBanner } from '@/components/guest/welcome-banner';
import { AmenitiesCta } from '@/components/guest/amenities-cta';
import { HotelDescription } from '@/components/guest/hotel-description';
import { PolecamySection } from '@/components/guest/polecamy-section';

export default async function GuestHomePage() {
  const { guestFirstName, roomNumber, propertyId, sessionId, propertyName } = await requireGuestSession();

  const client = await withTenantContext(await headers());
  const locale = await getLocale();
  const services = await getPinnedServices(client, propertyId, locale);

  return (
    <>
      <SplashScreen />
      <main>
        <HeroImage />
        <WelcomeBanner guestFirstName={guestFirstName} roomNumber={roomNumber} />
        <AmenitiesCta />
        <HotelDescription />
        <PolecamySection services={services} sessionId={sessionId} hotelName={propertyName} />
      </main>
    </>
  );
}
