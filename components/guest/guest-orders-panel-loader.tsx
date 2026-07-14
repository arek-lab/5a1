'use client';

import dynamic from 'next/dynamic';

const GuestOrdersPanel = dynamic(
  () => import('./guest-orders-panel').then(m => m.GuestOrdersPanel),
  { ssr: false, loading: () => <div className="h-32 animate-pulse rounded-card bg-guest-stone" /> }
);

export { GuestOrdersPanel as GuestOrdersPanelLoader };
