'use client';

import { useTranslations } from 'next-intl';
import { useOnlineStatus } from '@/lib/guest/use-online-status';

export function OfflineToast() {
  const t = useTranslations('guest.offline');
  const isOnline = useOnlineStatus();

  if (isOnline) {
    return null;
  }

  return (
    <div className="fixed left-1/2 top-20 z-50 -translate-x-1/2 rounded-pill bg-guest-ink px-4 py-3 text-sm font-medium text-guest-paper shadow-soft">
      {t('toastMessage')}
    </div>
  );
}
