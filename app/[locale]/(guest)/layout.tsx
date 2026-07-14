import { requireGuestSession } from '@/lib/guest/require-session';
import { LanguageSwitcher } from '@/components/guest/language-switcher';
import { BottomNav } from '@/components/guest/bottom-nav';
import { OfflineToast } from '@/components/guest/offline-toast';

export default async function GuestLayout({ children }: { children: React.ReactNode }) {
  const { propertyName, logoUrl, authLevel } = await requireGuestSession();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-16 shrink-0 items-center justify-between border-b bg-white px-4 text-gray-900">
        <div className="flex h-10 items-center">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={propertyName} className="h-10 max-w-[160px] object-contain" />
          ) : (
            <span className="text-lg font-semibold text-gray-900">{propertyName}</span>
          )}
        </div>
        <LanguageSwitcher />
      </header>
      <div className="flex-1 overflow-y-auto pb-16">{children}</div>
      <BottomNav authLevel={authLevel} />
      <OfflineToast />
    </div>
  );
}
