'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { GuestOrder } from '@/lib/guest/orders';

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

export function GuestOrdersPanel({ initialOrders }: { initialOrders: GuestOrder[] }) {
  const t = useTranslations('guest.orders');
  const [orders, setOrders] = useState<GuestOrder[]>(initialOrders);

  useEffect(() => {
    const source = new EventSource('/api/orders/stream/guest');

    source.onmessage = event => {
      const payload: SsePayload = JSON.parse(event.data);
      setOrders(prev => {
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
      });
    };

    return () => source.close();
  }, []);

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
    </div>
  );
}
