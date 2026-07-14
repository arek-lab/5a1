import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireGuestSession } from '@/lib/guest/require-session';

export default async function RoomRequiredPage() {
  await requireGuestSession();
  const t = await getTranslations('guest.roomRequired');

  return (
    <main className="flex flex-col items-center gap-4 px-4 py-12 text-center">
      <h1 className="font-display text-xl font-semibold text-guest-ink">{t('title')}</h1>
      <p className="text-guest-ink-muted">{t('body')}</p>
      <Link
        href="/scan"
        className="rounded-pill bg-guest-accent px-6 py-3 text-sm font-medium text-white hover:opacity-90"
      >
        {t('cta')}
      </Link>
    </main>
  );
}
