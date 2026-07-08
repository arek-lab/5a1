'use client';

import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { routing } from '@/i18n/routing';

const LOCALE_STORAGE_KEY = 'locale';

function persistLocale(nextLocale: string) {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
  document.cookie = `NEXT_LOCALE=${nextLocale}; Path=/; SameSite=Lax; Max-Age=31536000`;
}

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();

  const switchTo = (nextLocale: (typeof routing.locales)[number]) => {
    if (nextLocale === locale) return;
    persistLocale(nextLocale);
    router.refresh();
  };

  return (
    <div className="flex items-center gap-1 text-sm font-medium" aria-label="Language switcher">
      {routing.locales.map((loc, index) => (
        <span key={loc} className="flex items-center gap-1">
          {index > 0 && <span aria-hidden="true">|</span>}
          <button
            type="button"
            onClick={() => switchTo(loc)}
            aria-current={loc === locale ? 'true' : undefined}
            className={loc === locale ? 'underline' : 'opacity-60 hover:opacity-100'}
          >
            {loc.toUpperCase()}
          </button>
        </span>
      ))}
    </div>
  );
}
