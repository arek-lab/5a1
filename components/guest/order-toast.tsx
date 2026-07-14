'use client';

import { useEffect } from 'react';

const AUTO_DISMISS_MS = 5000;

export function OrderToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const timeout = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timeout);
  }, [onDismiss]);

  return (
    <div className="fixed left-1/2 top-20 z-50 -translate-x-1/2 rounded-pill bg-guest-ink px-4 py-3 text-sm font-medium text-guest-paper shadow-soft">
      {message}
    </div>
  );
}
