'use client';

import { useEffect, useState } from 'react';

export function SplashScreen({ durationMs = 1500 }: { durationMs?: number }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), durationMs);
    return () => clearTimeout(timer);
  }, [durationMs]);

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 top-16 z-40 flex items-center justify-center bg-guest-stone">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon.svg" alt="" aria-hidden="true" className="h-20 w-20" />
    </div>
  );
}
