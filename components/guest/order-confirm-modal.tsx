'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ServiceDetail } from '@/lib/guest/services';
import type { GuestOrderContext } from './order-cta';

const NOTE_MAX_LENGTH = 500;

export function OrderConfirmModal({
  service,
  guestContext,
  scheduledTime,
  onClose,
}: {
  service: ServiceDetail;
  guestContext: GuestOrderContext;
  scheduledTime?: string;
  onClose: () => void;
}) {
  const t = useTranslations('guest.orderModal');
  const router = useRouter();
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId: service.id,
          note: note.trim() || undefined,
          scheduledTime,
        }),
      });
      if (!response.ok) {
        setError(t('errorMessage'));
        return;
      }
      const { orderId } = await response.json();
      router.push(`/order-success?orderId=${orderId}`);
    } catch {
      setError(t('errorMessage'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <div className="w-full max-w-md rounded-t-2xl bg-white p-4 sm:rounded-2xl">
        <h2 className="text-lg font-semibold text-gray-900">{t('title')}</h2>
        <p className="mt-1 text-sm text-gray-600">{service.name}</p>

        <label className="mt-4 flex flex-col gap-1 text-sm font-medium text-gray-900">
          {t('noteLabel')}
          <textarea
            value={note}
            onChange={event => setNote(event.target.value.slice(0, NOTE_MAX_LENGTH))}
            maxLength={NOTE_MAX_LENGTH}
            placeholder={t('notePlaceholder')}
            className="min-h-[80px] rounded border px-3 py-2"
          />
        </label>
        <p className="mt-1 text-right text-xs text-gray-400">
          {note.length}/{NOTE_MAX_LENGTH}
        </p>

        {error && (
          <div className="mt-2 rounded bg-red-50 p-3 text-sm text-red-700">
            <p>{error}</p>
            {guestContext.phoneReception && (
              <a
                href={`tel:${guestContext.phoneReception}`}
                className="mt-1 inline-block font-semibold underline"
              >
                {t('callReception')}
              </a>
            )}
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 rounded-full border px-4 py-3 text-sm font-semibold text-gray-700 disabled:opacity-50"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="flex-1 rounded-full bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {submitting ? t('submitting') : error ? t('retry') : t('submit')}
          </button>
        </div>
      </div>
    </div>
  );
}
