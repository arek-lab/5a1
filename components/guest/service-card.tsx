import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ServiceListItem } from '@/lib/guest/services';
import type { ServiceCategory } from '@/lib/panel/service-categories';

export function ServiceCard({ service, category }: { service: ServiceListItem; category: ServiceCategory }) {
  const t = useTranslations('guest.service');

  const price = service.priceCents === null ? t('included') : (service.priceCents / 100).toFixed(2);

  const content = (
    <>
      {service.imageUrl && (
        <div className="relative h-32 w-full">
          <Image
            src={service.imageUrl}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, 320px"
            className="rounded-t-card object-cover"
          />
        </div>
      )}
      <div className="flex items-center justify-between p-3">
        <span className="font-display font-medium">{service.name}</span>
        <span className="font-mono text-sm text-guest-ink-muted">{price}</span>
      </div>
      {!service.isActive && (
        <span className="mx-3 mb-3 inline-block rounded-pill bg-guest-stone px-2 py-0.5 text-xs font-medium text-guest-ink-muted">
          {t('unavailable')}
        </span>
      )}
    </>
  );

  if (!service.isActive) {
    return (
      <div className="cursor-not-allowed rounded-card border border-guest-ink-muted/15 bg-guest-stone text-guest-ink-muted opacity-60">
        {content}
      </div>
    );
  }

  return (
    <Link
      href={`/c/${category}/${service.id}`}
      className="block rounded-card border border-guest-ink-muted/15 bg-guest-paper text-guest-ink shadow-soft hover:bg-guest-stone"
    >
      {content}
    </Link>
  );
}
