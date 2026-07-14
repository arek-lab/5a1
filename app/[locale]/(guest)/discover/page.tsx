import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { requireGuestSession } from '@/lib/guest/require-session';
import { withTenantContext } from '@/lib/supabase/tenant';
import { getLocalAreaContent } from '@/lib/guest/discover';

export default async function DiscoverPage() {
  const { propertyId } = await requireGuestSession();
  const client = await withTenantContext(await headers());
  const t = await getTranslations('guest.discover');

  const items = await getLocalAreaContent(client, propertyId);

  return (
    <main className="px-4 py-6">
      <h1 className="text-xl font-semibold text-gray-900">{t('title')}</h1>

      {items.length === 0 ? (
        <p className="mt-4 text-sm text-gray-600">{t('empty')}</p>
      ) : (
        <ul className="mt-4 space-y-6">
          {items.map((item, index) => (
            <li key={index}>
              {item.question && (
                <h2 className="text-base font-semibold text-gray-900">{item.question}</h2>
              )}
              <p className="mt-1 whitespace-pre-line text-sm text-gray-600">{item.content}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
