import { requireGuestSession } from '@/lib/guest/require-session';
import { LanguageSwitcher } from '@/components/guest/language-switcher';
import { FloatingConciergeButton } from '@/components/guest/floating-concierge-button';

export default async function GuestLayout({ children }: { children: React.ReactNode }) {
  const { propertyName, logoUrl } = await requireGuestSession();

  return (
    <>
      <header className="flex h-16 items-center justify-between border-b bg-white px-4 text-gray-900">
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
      {children}
      <FloatingConciergeButton />
    </>
  );
}
