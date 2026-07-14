'use client';

import dynamic from 'next/dynamic';

const GuestOrdersPanel = dynamic(
  () => import('./guest-orders-panel').then(m => m.GuestOrdersPanel),
  { ssr: false, loading: () => <div className="h-32 animate-pulse rounded bg-gray-100" /> }
);

export { GuestOrdersPanel as GuestOrdersPanelLoader };
