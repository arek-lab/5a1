import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ServiceCategory } from '@/lib/panel/service-categories';

const CATEGORY_IMAGE: Record<ServiceCategory, string> = {
  restaurant:
    'https://images.unsplash.com/photo-1555244162-803834f70033?fm=jpg&q=60&w=3000&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
  room_service:
    'https://plus.unsplash.com/premium_photo-1661392877411-8a4c5ba70462?w=700&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MXx8cm9vbSUyMHNlcnZpY2V8ZW58MHx8MHx8fDA%3D',
  spa: 'https://images.unsplash.com/photo-1583416750470-965b2707b355?w=700&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTh8fHdlbGxuZXNzJTIwc3BhfGVufDB8fDB8fHww',
  transport:
    'https://images.unsplash.com/photo-1642325017820-d081feea1969?w=700&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Nnx8aG90ZWwlMjB0cmFuc3BvcnR8ZW58MHx8MHx8fDA%3D',
  info: 'https://plus.unsplash.com/premium_photo-1661302861607-6f3c68a2140d?w=700&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTN8fGhvdGVsJTIwaW5mb3JtYXRpb258ZW58MHx8MHx8fDA%3D',
};

export function CategoryGrid({ visibleCategories }: { visibleCategories: ServiceCategory[] }) {
  const t = useTranslations('guest.categories');

  return (
    <div className="flex flex-col gap-2.5 px-4">
      {visibleCategories.map(category => (
        <Link
          key={category}
          href={`/c/${category}`}
          className="flex h-[84px] items-stretch overflow-hidden rounded-card border border-guest-ink-muted/15 shadow-soft"
        >
          <span className="relative w-[84px] shrink-0">
            <Image src={CATEGORY_IMAGE[category]} alt="" fill sizes="84px" className="object-cover" />
          </span>
          <span className="flex flex-1 items-center justify-between gap-3 border-l border-guest-ink-muted/10 bg-guest-paper/65 px-4 backdrop-blur-lg">
            <span className="text-base font-medium text-guest-ink">{t(category)}</span>
            <span aria-hidden className="text-guest-ink-muted">
              ›
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}
