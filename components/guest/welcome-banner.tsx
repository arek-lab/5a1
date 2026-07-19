import Link from 'next/link';
import { useTranslations } from 'next-intl';

// Bez wariantu z imieniem: minimalizacja PII (s2-9) — recepcja nie zbiera imion,
// powitanie identyfikuje wyłącznie pokój.
export function WelcomeBanner({ roomNumber }: { roomNumber: string | null }) {
  const t = useTranslations('guest.welcome');

  if (!roomNumber) {
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

  return (
    <div className="px-4 py-6">
      <h1 className="font-display text-xl font-semibold text-guest-ink">
        {t('greetingWithRoom', { room: roomNumber })}
      </h1>
    </div>
  );
}
