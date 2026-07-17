import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { requireGuestSession } from '@/lib/guest/require-session';
import { SignOutTile } from '@/components/guest/sign-out-tile';

function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(
    new Date(value)
  );
}

export default async function MyStayPage() {
  const { guestFirstName, roomNumber, checkIn, checkOut } = await requireGuestSession();
  const locale = await getLocale();
  const t = await getTranslations('guest.myStay');

  return (
    <main className="px-4 py-6">
      <h1 className="font-display text-xl font-semibold text-guest-ink">{t('title')}</h1>

      {guestFirstName && <p className="mt-4 text-base text-guest-ink">{guestFirstName}</p>}

      {roomNumber && (
        <p className="mt-2 text-sm text-guest-ink-muted">
          {t('roomLabel')} <span className="font-mono text-guest-ink">{roomNumber}</span>
        </p>
      )}

      {checkIn && checkOut && (
        <dl className="mt-4 space-y-1 text-sm text-guest-ink-muted">
          <div className="flex gap-2">
            <dt>{t('checkInLabel')}</dt>
            <dd className="font-mono text-guest-ink">{formatDate(checkIn, locale)}</dd>
          </div>
          <div className="flex gap-2">
            <dt>{t('checkOutLabel')}</dt>
            <dd className="font-mono text-guest-ink">{formatDate(checkOut, locale)}</dd>
          </div>
        </dl>
      )}

      <Link
        href="/my-orders"
        className="mt-6 inline-block text-sm font-semibold text-guest-ink underline"
      >
        {t('ordersLink')}
      </Link>

      <SignOutTile />
    </main>
  );
}
