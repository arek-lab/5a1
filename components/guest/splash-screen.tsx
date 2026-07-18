'use client';

import { useEffect, useState } from 'react';

const SPLASH_SHOWN_KEY = 'guest-splash-shown';

function hasSplashBeenShown(): boolean {
  // sessionStorage throws in some privacy modes — treat that as "not shown yet" so the
  // guest just sees the splash once more instead of crashing the home page.
  try {
    return sessionStorage.getItem(SPLASH_SHOWN_KEY) !== null;
  } catch {
    return false;
  }
}

function markSplashShown(): void {
  try {
    sessionStorage.setItem(SPLASH_SHOWN_KEY, '1');
  } catch {
    // Ignored: worst case the splash shows again on the next visit.
  }
}

export function SplashScreen({ durationMs = 700, fadeMs = 300 }: { durationMs?: number; fadeMs?: number }) {
  // Starts hidden so SSR and the first client render are identical — the sessionStorage
  // decision is only available post-hydration. Returning guests in the same browser
  // session therefore never see even a flash; first-timers get one splash per session.
  const [phase, setPhase] = useState<'hidden' | 'visible' | 'fading'>('hidden');

  useEffect(() => {
    if (hasSplashBeenShown()) return;
    markSplashShown();
    // The show/skip decision needs sessionStorage, which is only safe post-hydration —
    // SSR and the first client render must both produce `null`, so the flip to visible
    // cannot happen anywhere but an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhase('visible');
    const fadeTimer = setTimeout(() => setPhase('fading'), durationMs);
    const hideTimer = setTimeout(() => setPhase('hidden'), durationMs + fadeMs);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, [durationMs, fadeMs]);

  if (phase === 'hidden') return null;

  return (
    <div
      className={`fixed inset-x-0 bottom-0 top-16 z-40 flex items-center justify-center bg-guest-stone transition-opacity ${
        phase === 'fading' ? 'opacity-0' : 'opacity-100'
      }`}
      style={{ transitionDuration: `${fadeMs}ms` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon.svg" alt="" aria-hidden="true" className="h-20 w-20" />
    </div>
  );
}
