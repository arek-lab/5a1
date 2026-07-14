import Link from 'next/link';
import { useTranslations } from 'next-intl';

export function WelcomeBanner({
  guestFirstName,
  roomNumber,
}: {
  guestFirstName: string | null;
  roomNumber: string | null;
}) {
  const t = useTranslations('guest.welcome');

  if (!guestFirstName && !roomNumber) {
    return (
      <div className="px-4 py-6">
        <Link
          href="/scan"
          className="inline-flex items-center justify-center rounded-pill bg-guest-accent px-6 py-3 text-base font-semibold text-white hover:opacity-90"
        >
          {t('scanCta')}
        </Link>
      </div>
    );
  }

  const greeting = guestFirstName
    ? t('greetingWithName', { name: guestFirstName })
    : t('greetingWithRoom', { room: roomNumber! });

  return (
    <div className="px-4 py-6">
      <h1 className="font-display text-xl font-semibold text-guest-ink">{greeting}</h1>
    </div>
  );
}
