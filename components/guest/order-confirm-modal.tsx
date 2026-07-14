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
      <div className="w-full max-w-md rounded-t-card bg-guest-paper p-4 shadow-soft sm:rounded-card">
        <h2 className="font-display text-lg font-semibold text-guest-ink">{t('title')}</h2>
        <p className="mt-1 text-sm text-guest-ink-muted">{service.name}</p>

        <label className="mt-4 flex flex-col gap-1 text-sm font-medium text-guest-ink">
          {t('noteLabel')}
          <textarea
            value={note}
            onChange={event => setNote(event.target.value.slice(0, NOTE_MAX_LENGTH))}
            maxLength={NOTE_MAX_LENGTH}
            placeholder={t('notePlaceholder')}
            className="min-h-[80px] rounded border border-guest-ink-muted/30 bg-guest-stone px-3 py-2 text-guest-ink"
          />
        </label>
        <p className="mt-1 text-right text-xs font-mono text-guest-ink-muted">
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
            className="flex-1 rounded-pill border border-guest-ink-muted/30 px-4 py-3 text-sm font-semibold text-guest-ink-muted disabled:opacity-50"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="flex-1 rounded-pill bg-guest-accent px-4 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? t('submitting') : error ? t('retry') : t('submit')}
          </button>
        </div>
      </div>
    </div>
  );
}
