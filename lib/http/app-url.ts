// Railway's proxy exposes `Host: localhost:<internal-port>` to the container, so
// `request.url` (and therefore `new URL(path, request.url)`) resolves redirects to
// an unreachable internal host instead of the public domain. NEXT_PUBLIC_APP_URL is
// the one origin we control end-to-end — use it instead of trusting the request.
export function absoluteUrl(path: string): URL {
  return new URL(path, process.env.NEXT_PUBLIC_APP_URL)
}
