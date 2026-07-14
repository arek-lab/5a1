'use client';

import { useEffect, useState } from 'react';
import type { PinnedService } from '@/lib/guest/services';

const FREQUENCY_CAP_MS = 24 * 60 * 60 * 1000;

function storageKey(sessionId: string) {
  return `polecamy_seen_${sessionId}`;
}

export function shouldShowPolecamy(
  sessionId: string,
  now: number,
  getItem: (key: string) => string | null
): boolean {
  const raw = getItem(storageKey(sessionId));
  if (!raw) return true;
  const seenAt = Number(raw);
  if (!Number.isFinite(seenAt)) return true;
  return now - seenAt >= FREQUENCY_CAP_MS;
}

export function PolecamySection({
  services,
  sessionId,
  hotelName,
}: {
  services: PinnedService[];
  sessionId: string;
  hotelName: string;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      const show = shouldShowPolecamy(sessionId, Date.now(), key => window.localStorage.getItem(key));
      setVisible(show);
      if (show) {
        window.localStorage.setItem(storageKey(sessionId), String(Date.now()));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (!visible || services.length === 0) return null;

  return (
    <div className="px-4 py-6">
      <h2 className="mb-3 font-display text-lg font-semibold text-guest-ink">Polecane przez {hotelName}</h2>
      <ul className="space-y-2">
        {services.map(service => (
          <li
            key={service.id}
            className="flex items-center justify-between rounded-card border border-guest-ink-muted/15 bg-guest-paper px-4 py-3 shadow-soft"
          >
            <span className="font-medium text-guest-ink">{service.name}</span>
            <span className="font-mono text-sm text-guest-ink-muted">
              {service.priceCents === null ? 'W cenie' : `${(service.priceCents / 100).toFixed(2)}`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
