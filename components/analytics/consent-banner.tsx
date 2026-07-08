'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { isDoNotTrackEnabled } from '@/lib/analytics/dnt';

const DISMISS_KEY = 'analytics_banner_dismissed';

export function ConsentBanner() {
  const [visible, setVisible] = useState(false);
  const t = useTranslations('analytics.banner');

  useEffect(() => {
    if (isDoNotTrackEnabled()) return;
    if (window.localStorage.getItem(DISMISS_KEY)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is unreadable during SSR; this syncs one-time visibility after mount
    setVisible(true);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    window.localStorage.setItem(DISMISS_KEY, '1');
    setVisible(false);
  };

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-50 flex flex-wrap items-center justify-between gap-3 bg-slate-900 px-4 py-3 text-sm text-white"
    >
      <p>{t('message')}</p>
      <button
        type="button"
        onClick={dismiss}
        className="rounded bg-white/10 px-3 py-1 font-medium hover:bg-white/20"
      >
        {t('dismiss')}
      </button>
    </div>
  );
}
