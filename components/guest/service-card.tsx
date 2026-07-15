import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ServiceListItem } from '@/lib/guest/services';
import type { ServiceCategory } from '@/lib/panel/service-categories';

export function ServiceCard({ service, category }: { service: ServiceListItem; category: ServiceCategory }) {
  const t = useTranslations('guest.service');

  const price = service.priceCents === null ? t('included') : (service.priceCents / 100).toFixed(2);

  const content = (
    <>
      <span className="font-display font-medium">{service.name}</span>
      <span className="flex items-center gap-3">
        <span className="font-mono text-sm text-guest-ink-muted">{price}</span>
        {!service.isActive && (
          <span className="inline-block rounded-pill bg-guest-stone px-2 py-0.5 text-xs font-medium text-guest-ink-muted">
            {t('unavailable')}
          </span>
        )}
      </span>
    </>
  );

  if (!service.isActive) {
    return (
      <div className="flex min-h-[72px] cursor-not-allowed items-center justify-between rounded-card border border-guest-ink-muted/15 bg-guest-stone px-4 text-guest-ink-muted opacity-60">
        {content}
      </div>
    );
  }

  return (
    <Link
      href={`/c/${category}/${service.id}`}
      className="flex min-h-[72px] items-center justify-between rounded-card border border-guest-ink-muted/15 bg-guest-paper/65 px-4 text-guest-ink shadow-soft backdrop-blur-lg hover:bg-guest-stone"
    >
      {content}
    </Link>
  );
}
