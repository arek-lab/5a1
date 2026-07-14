import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireGuestSession } from '@/lib/guest/require-session';

export default async function RoomRequiredPage() {
  await requireGuestSession();
  const t = await getTranslations('guest.roomRequired');

  return (
    <main className="flex flex-col items-center gap-4 px-4 py-12 text-center">
      <h1 className="text-xl font-semibold text-gray-900">{t('title')}</h1>
      <p className="text-gray-600">{t('body')}</p>
      <Link
        href="/scan"
        className="rounded-full bg-gray-900 px-6 py-3 text-sm font-medium text-white hover:bg-gray-700"
      >
        {t('cta')}
      </Link>
    </main>
  );
}
