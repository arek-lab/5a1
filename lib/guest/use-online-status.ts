'use client';

import { useEffect, useRef, useState } from 'react';

const REACHABILITY_CHECK_INTERVAL_MS = 5000;

async function isReachable(): Promise<boolean> {
  try {
    const response = await fetch('/api/health', { cache: 'no-store' });
    return response.ok;
  } catch {
    return false;
  }
}

// navigator.onLine only reflects OS network-interface state — it can read
// "online" behind a captive portal or when the backend is unreachable, so an
// 'online' transition is confirmed with a same-origin ping before we trust it.
// A poll keeps checking while offline in case the browser never fires 'online'.
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    function stopPolling() {
      if (pollRef.current !== null) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }

    function startPolling() {
      if (pollRef.current !== null) return;
      pollRef.current = setInterval(async () => {
        if (await isReachable()) {
          setIsOnline(true);
          stopPolling();
        }
      }, REACHABILITY_CHECK_INTERVAL_MS);
    }

    async function handleOnline() {
      if (await isReachable()) {
        setIsOnline(true);
        stopPolling();
      } else {
        setIsOnline(false);
        startPolling();
      }
    }

    function handleOffline() {
      setIsOnline(false);
      startPolling();
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      startPolling();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      stopPolling();
    };
  }, []);

  return isOnline;
}
