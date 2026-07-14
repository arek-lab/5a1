'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { GuestOrder } from '@/lib/guest/orders';
import { OrderToast } from './order-toast';

const POLL_INTERVAL_MS = 10_000;

type SsePayload = {
  id: string;
  status: GuestOrder['status'];
  note: string | null;
  created_at: string;
  scheduled_at: string | null;
};

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString();
}

const STATUS_BADGE_CLASS: Record<GuestOrder['status'], string> = {
  new: 'bg-guest-stone text-guest-ink-muted',
  confirmed: 'bg-guest-moss/15 text-guest-moss',
  fulfilled: 'bg-guest-moss/15 text-guest-moss',
  rejected: 'bg-red-100 text-red-700',
};

function mergeOrder(prev: GuestOrder[], payload: SsePayload): GuestOrder[] {
  const index = prev.findIndex(order => order.id === payload.id);
  if (index === -1) {
    return [
      {
        id: payload.id,
        status: payload.status,
        createdAt: payload.created_at,
        scheduledAt: payload.scheduled_at,
        note: payload.note,
        serviceName: '',
      },
      ...prev,
    ];
  }
  const next = [...prev];
  next[index] = {
    ...next[index],
    status: payload.status,
    note: payload.note,
    scheduledAt: payload.scheduled_at,
  };
  return next;
}

export function GuestOrdersPanel({ initialOrders }: { initialOrders: GuestOrder[] }) {
  const t = useTranslations('guest.orders');
  const [orders, setOrders] = useState<GuestOrder[]>(initialOrders);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const connectionModeRef = useRef<'sse' | 'polling'>('sse');
  const ordersRef = useRef<GuestOrder[]>(initialOrders);

  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  useEffect(() => {
    const source = new EventSource('/api/orders/stream/guest');
    let pollInterval: ReturnType<typeof setInterval> | undefined;

    // Checked against ordersRef (not the setOrders updater's own `prev`) so this stays
    // a plain side effect fired before the state update, instead of nesting a second
    // setState call inside setOrders' functional updater.
    function checkRejected(id: string, nextStatus: GuestOrder['status']) {
      const previous = ordersRef.current.find(order => order.id === id);
      if (previous && previous.status !== 'rejected' && nextStatus === 'rejected') {
        setToastMessage(t('toast.rejected'));
      }
    }

    function applyUpdate(payload: SsePayload) {
      checkRejected(payload.id, payload.status);
      setOrders(prev => mergeOrder(prev, payload));
    }

    async function poll() {
      const response = await fetch('/api/orders/guest');
      if (!response.ok) return;
      const { orders: fetched }: { orders: GuestOrder[] } = await response.json();
      for (const order of fetched) checkRejected(order.id, order.status);
      setOrders(fetched);
    }

    source.onmessage = event => {
      applyUpdate(JSON.parse(event.data));
    };

    source.onerror = () => {
      if (connectionModeRef.current === 'polling') return;
      connectionModeRef.current = 'polling';
      source.close();
      pollInterval = setInterval(poll, POLL_INTERVAL_MS);
    };

    return () => {
      source.close();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [t]);

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <p className="text-guest-ink-muted">{t('empty.message')}</p>
        <Link
          href="/"
          className="rounded-pill bg-guest-accent px-6 py-3 text-base font-semibold text-white hover:opacity-90"
        >
          {t('empty.cta')}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-xl font-semibold text-guest-ink">{t('title')}</h1>
      <ul className="divide-y divide-guest-ink-muted/15 rounded-card border border-guest-ink-muted/15 bg-guest-paper">
        {orders.map(order => (
          <li key={order.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
            <div className="flex flex-col">
              <span className="font-medium text-guest-ink">{order.serviceName}</span>
              <span className="font-mono text-sm text-guest-ink-muted">
                {order.scheduledAt ? formatDateTime(order.scheduledAt) : formatDateTime(order.createdAt)}
              </span>
            </div>
            <span className={`rounded-pill px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASS[order.status]}`}>
              {t(`status.${order.status}`)}
            </span>
          </li>
        ))}
      </ul>
      {toastMessage && <OrderToast message={toastMessage} onDismiss={() => setToastMessage(null)} />}
    </div>
  );
}
