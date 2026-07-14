'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ServiceDetail } from '@/lib/guest/services';
import { generateTimeSlots } from '@/lib/guest/time-slots';
import { useOnlineStatus } from '@/lib/guest/use-online-status';
import { OrderConfirmModal } from './order-confirm-modal';

export type GuestOrderContext = {
  propertyId: string;
  sessionId: string;
  roomId: string | null;
  reservationId: string | null;
  phoneReception: string | null;
};

export function OrderCta({
  service,
  guestContext,
}: {
  service: ServiceDetail;
  guestContext: GuestOrderContext;
}) {
  const t = useTranslations('guest.service');
  const slots = service.isTimeSensitive ? generateTimeSlots(service.availableFrom, service.availableTo) : [];
  const [scheduledTime, setScheduledTime] = useState<string | undefined>(slots[0]);
  const [isModalOpen, setModalOpen] = useState(false);
  const isOnline = useOnlineStatus();

  return (
    <div className="space-y-3">
      {slots.length > 0 && (
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
          {t('timeLabel')}
          <select
            value={scheduledTime}
            onChange={event => setScheduledTime(event.target.value)}
            className="rounded border px-3 py-2"
          >
            {slots.map(slot => (
              <option key={slot} value={slot}>
                {slot}
              </option>
            ))}
          </select>
        </label>
      )}
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        disabled={!isOnline}
        className="w-full rounded-full bg-gray-900 px-6 py-3 text-base font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
      >
        {t('orderCta')}
      </button>
      {isModalOpen && (
        <OrderConfirmModal
          service={service}
          guestContext={guestContext}
          scheduledTime={scheduledTime}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
