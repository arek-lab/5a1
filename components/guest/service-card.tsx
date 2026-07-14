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
            className="rounded-t-lg object-cover"
          />
        </div>
      )}
      <div className="flex items-center justify-between p-3">
        <span className="font-medium">{service.name}</span>
        <span className="text-sm text-gray-600">{price}</span>
      </div>
      {!service.isActive && (
        <span className="mx-3 mb-3 inline-block rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">
          {t('unavailable')}
        </span>
      )}
    </>
  );

  if (!service.isActive) {
    return (
      <div className="cursor-not-allowed rounded-lg border bg-gray-50 text-gray-400 opacity-60">{content}</div>
    );
  }

  return (
    <Link
      href={`/c/${category}/${service.id}`}
      className="block rounded-lg border bg-white text-gray-900 hover:bg-gray-50"
    >
      {content}
    </Link>
  );
}
