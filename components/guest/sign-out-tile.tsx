'use client';
import { useTranslations } from 'next-intl';
import { GUEST_SESSION_CACHE_NAMES } from '@/lib/sw/matchers';

// The `pages` SW cache (app/sw.ts) is keyed by URL only, not by session — without this,
// the next guest navigation on this device (e.g. after re-scanning reception) would paint
// instantly from this session's stale cached HTML via StaleWhileRevalidate, before the SW
// quietly refetches in the background.
async function clearGuestCaches(): Promise<void> {
  if (typeof window === 'undefined' || !('caches' in window)) return;
  await Promise.allSettled(GUEST_SESSION_CACHE_NAMES.map((name) => caches.delete(name)));
}

export function SignOutTile() {
  const t = useTranslations('guest.myStay');

  return (
    <form
      action="/api/guest/sign-out"
      method="post"
      onSubmit={(e) => {
        if (!window.confirm(t('signOutConfirm'))) {
          e.preventDefault();
          return;
        }
        // Programmatic .submit() bypasses this handler (no 'submit' event), so
        // there's no risk of re-prompting the confirm dialog or double-submitting.
        e.preventDefault();
        const form = e.currentTarget;
        void clearGuestCaches().finally(() => form.submit());
      }}
      className="mt-6"
    >
      <button
        type="submit"
        className="flex min-h-[72px] w-full items-center justify-center rounded-card border border-guest-ink-muted/15 bg-guest-paper/65 px-4 text-sm font-semibold text-guest-ink shadow-soft backdrop-blur-lg hover:bg-guest-stone"
      >
        {t('signOutTile')}
      </button>
    </form>
  );
}
