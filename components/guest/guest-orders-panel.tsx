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
        <p className="text-gray-600">{t('empty.message')}</p>
        <Link
          href="/"
          className="rounded-full bg-gray-900 px-6 py-3 text-base font-semibold text-white hover:bg-gray-700"
        >
          {t('empty.cta')}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">{t('title')}</h1>
      <ul className="divide-y rounded border">
        {orders.map(order => (
          <li key={order.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
            <div className="flex flex-col">
              <span className="font-medium text-gray-900 dark:text-gray-100">{order.serviceName}</span>
              <span className="text-sm text-gray-500">
                {order.scheduledAt ? formatDateTime(order.scheduledAt) : formatDateTime(order.createdAt)}
              </span>
            </div>
            <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700">
              {t(`status.${order.status}`)}
            </span>
          </li>
        ))}
      </ul>
      {toastMessage && <OrderToast message={toastMessage} onDismiss={() => setToastMessage(null)} />}
    </div>
  );
}
