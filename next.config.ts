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
  // App Router client-side navigation (next/link) fetches an RSC payload, not
  // a `document` — our own runtimeCaching document rule never sees it. This
  // hooks history.pushState to explicitly fetch+cache the destination
  // document into the "pages" cache on every soft navigation.
  cacheOnNavigation: true,
});

const nextConfig: NextConfig = {};

export default withSerwist(
  withSentryConfig(withNextIntl(nextConfig), {
    silent: true,
  })
);
