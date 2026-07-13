'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const CONCIERGE_PATH = '/concierge';

export function FloatingConciergeButton() {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === CONCIERGE_PATH) {
    return (
      <button
        type="button"
        onClick={() => router.back()}
        aria-label="Zamknij czat"
        className="fixed bottom-4 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gray-900 text-white shadow-lg hover:bg-gray-700"
      >
        <span aria-hidden="true" className="text-2xl">✕</span>
      </button>
    );
  }

  return (
    <Link
      href={CONCIERGE_PATH}
      aria-label="Concierge"
      className="fixed bottom-4 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gray-900 text-white shadow-lg hover:bg-gray-700"
    >
      <span aria-hidden="true" className="text-2xl">💬</span>
    </Link>
  );
}
