'use client';

import dynamic from 'next/dynamic';

const ConciergeChat = dynamic(
  () => import('./concierge-chat').then(m => m.ConciergeChat),
  { ssr: false, loading: () => <div className="flex-1 animate-pulse rounded-2xl bg-gray-100" /> }
);

export { ConciergeChat as ConciergeChatLoader };
