import { useTranslations } from 'next-intl';

export function HotelDescription() {
  const t = useTranslations('guest.welcome');

  return <p className="px-4 py-2 text-sm text-guest-ink-muted">{t('description')}</p>;
}
