'use client';
import { useTranslations } from 'next-intl';

export function SignOutTile() {
  const t = useTranslations('guest.myStay');

  return (
    <form
      action="/api/guest/sign-out"
      method="post"
      onSubmit={(e) => {
        if (!window.confirm(t('signOutConfirm'))) e.preventDefault();
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
