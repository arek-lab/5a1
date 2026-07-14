import { requireGuestSession } from '@/lib/guest/require-session';
import { LanguageSwitcher } from '@/components/guest/language-switcher';
import { ThemeToggle } from '@/components/guest/theme-toggle';
import { BottomNav } from '@/components/guest/bottom-nav';
import { OfflineToast } from '@/components/guest/offline-toast';

export default async function GuestLayout({ children }: { children: React.ReactNode }) {
  const { propertyName, logoUrl, authLevel } = await requireGuestSession();

  return (
    <div data-theme="guest" className="flex h-dvh flex-col bg-guest-stone font-ui text-guest-ink">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-guest-ink-muted/15 bg-guest-paper px-4">
        <div className="flex h-10 items-center">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={propertyName} className="h-10 max-w-[160px] object-contain" />
          ) : (
            <span className="font-display text-lg font-semibold text-guest-ink">{propertyName}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto pb-16">{children}</div>
      <BottomNav authLevel={authLevel} />
      <OfflineToast />
    </div>
  );
}
