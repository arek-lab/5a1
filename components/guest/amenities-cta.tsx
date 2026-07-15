import Link from 'next/link';
import { useTranslations } from 'next-intl';

export function AmenitiesCta() {
  const t = useTranslations('guest.welcome');

  return (
    <div className="px-4 pb-2">
      <Link
        href="/amenities"
        className="inline-flex items-center justify-center rounded-pill bg-guest-accent px-6 py-3 text-base font-semibold text-white hover:opacity-90"
      >
        {t('amenitiesCta')}
      </Link>
    </div>
  );
}
