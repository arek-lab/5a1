'use client';

import { isDoNotTrackEnabled } from '@/lib/analytics/dnt';
import { useEffect } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Deferred to idle so analytics init doesn't compete with hydration on slow phones,
    // and dynamically imported so posthog-js stays out of the initial bundle — nothing
    // consumes the PostHog react context (no usePostHog anywhere; server-side capture
    // goes through posthog-node), so no PostHogProvider is needed either.
    // setTimeout fallback covers Safari, which still lacks requestIdleCallback.
    let cancelled = false;
    const init = async () => {
      if (cancelled || isDoNotTrackEnabled()) return;
      const { posthog } = await import('@/lib/posthog/client');
      if (cancelled || posthog.__loaded) return;
      posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
        person_profiles: 'never',
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        disable_session_recording: true,
      });
    };

    if (typeof window.requestIdleCallback === 'function') {
      const idleId = window.requestIdleCallback(() => void init());
      return () => {
        cancelled = true;
        window.cancelIdleCallback(idleId);
      };
    }
    const timeoutId = window.setTimeout(() => void init(), 2000);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, []);

  return <>{children}</>;
}
