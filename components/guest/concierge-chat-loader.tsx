'use client';

import dynamic from 'next/dynamic';

const ConciergeChat = dynamic(
  () => import('./concierge-chat').then(m => m.ConciergeChat),
  { ssr: false, loading: () => <div className="flex-1 animate-pulse rounded-card bg-guest-stone" /> }
);

export { ConciergeChat as ConciergeChatLoader };
