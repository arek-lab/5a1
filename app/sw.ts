/// <reference lib="webworker" />

import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from 'serwist';
import {
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  Serwist,
  StaleWhileRevalidate,
} from 'serwist';
import { isGuestNavigationRequest, isGuestOrdersGet, isNetworkOnlyApi } from '@/lib/sw/matchers';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// The offline fallback is an RSC page, not a build asset, so it's absent from
// __SW_MANIFEST — it must be added to precacheEntries by hand so the SW
// fetches and stores it at install time, before it's ever needed as a
// fallback. Bump OFFLINE_FALLBACK_REVISION when the offline page content
// changes, so precaching picks up the update on the next SW install.
const OFFLINE_FALLBACK_REVISION = '1';

const runtimeCaching: RuntimeCaching[] = [
  {
    matcher: ({ url }) =>
      url.pathname.startsWith('/_next/static/') ||
      url.pathname.startsWith('/icons/') ||
      url.pathname.startsWith('/fonts/'),
    handler: new CacheFirst({
      cacheName: 'guest-static-assets',
      plugins: [new ExpirationPlugin({ maxAgeSeconds: 30 * 24 * 60 * 60 })],
    }),
  },
  {
    matcher: isGuestNavigationRequest,
    // cacheName "pages" (not a locally-chosen name): @serwist/next's
    // cacheOnNavigation feature (next.config.ts) fetches the destination
    // document into a cache literally named "pages" on every next/link
    // client-side navigation. Reusing that name here means a page visited
    // only via soft navigation still shows up as a cache hit offline.
    handler: new StaleWhileRevalidate({ cacheName: 'pages' }),
  },
  {
    matcher: isGuestOrdersGet,
    handler: new NetworkFirst({
      cacheName: 'guest-orders-status',
      networkTimeoutSeconds: 3,
    }),
  },
  {
    matcher: isNetworkOnlyApi,
    handler: new NetworkOnly(),
  },
];

const serwist = new Serwist({
  precacheEntries: [
    ...(self.__SW_MANIFEST ?? []),
    { url: '/offline', revision: OFFLINE_FALLBACK_REVISION },
  ],
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
  fallbacks: {
    // Only one variant: `localePrefix: 'never'` means the browser (and this
    // SW) only ever sees the bare `/offline` path — the proxy rewrites to
    // /pl or /en server-side, invisibly to the client.
    entries: [
      {
        url: '/offline',
        matcher: ({ request }) => request.destination === 'document',
      },
    ],
  },
});

serwist.addEventListeners();
