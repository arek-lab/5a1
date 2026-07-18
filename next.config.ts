import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { withSentryConfig } from '@sentry/nextjs';
import createNextIntlPlugin from 'next-intl/plugin';
import withSerwistInit from '@serwist/next';
import { globSync } from 'glob';
import type { NextConfig } from 'next';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

// @serwist/next's built-in public-directory globbing (glob@10+) returns
// native path separators on Windows (`icons\icon.svg`), which 404s at
// precache-install time and leaves the SW stuck in "installing" forever.
// Building the manifest ourselves with posix-joined URLs sidesteps that
// upstream bug; behavior on Linux (CI/prod) is unchanged since `path.sep`
// is already "/" there.
const publicDir = path.resolve(process.cwd(), 'public');
const additionalPrecacheEntries = globSync('**/*', {
  cwd: publicDir,
  nodir: true,
  follow: true,
  ignore: ['sw.js', 'sw.js.map', 'swe-worker-*.js'],
}).map((file) => ({
  url: `/${file.split(path.sep).join('/')}`,
  revision: crypto.createHash('md5').update(fs.readFileSync(path.join(publicDir, file))).digest('hex'),
}));

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
  additionalPrecacheEntries,
  // cacheOnNavigation (offline "pages" cache fill on soft navigation) was removed in S7.2:
  // it issued a second full document fetch per soft navigation, doubling middleware runs —
  // and the per-request `SELECT sessions` is a hard HITL requirement that can't be cached
  // away, so the duplicate round-trip cost is structural. Trade-off: pages visited only via
  // soft navigation aren't cached for offline; precache + NetworkFirst on full loads remain.
});

// Only next/image-optimized hosts belong here — `hostname: '**'` turns the image optimizer
// into an open proxy (and burns CPU for arbitrary hosts). Unsplash stays until the category
// images (components/guest/category-grid.tsx) move into public/ like the hero did.
const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : '*.supabase.co';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: supabaseHostname },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'plus.unsplash.com' },
    ],
    formats: ['image/avif', 'image/webp'],
  },
};

export default withSerwist(
  withSentryConfig(withNextIntl(nextConfig), {
    silent: true,
  })
);
