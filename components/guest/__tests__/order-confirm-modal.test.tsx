// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { OrderConfirmModal } from '../order-confirm-modal'
import type { ServiceDetail } from '@/lib/guest/services'
import type { GuestOrderContext } from '../order-cta'
import messages from '@/messages/pl.json'

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.resetAllMocks()
})

const service: ServiceDetail = {
  id: 'service-1',
  name: 'Masaż',
  description: null,
  category: 'spa',
  priceCents: 5000,
  imageUrl: null,
  isActive: true,
  isTimeSensitive: false,
  availableFrom: null,
  availableTo: null,
}

const guestContext: GuestOrderContext = {
  propertyId: 'prop-1',
  sessionId: 'session-1',
  roomId: 'room-1',
  reservationId: 'reservation-1',
}

function renderModal(onClose = vi.fn()) {
  return render(
    <NextIntlClientProvider locale="pl" messages={messages}>
      <OrderConfirmModal service={service} guestContext={guestContext} onClose={onClose} />
    </NextIntlClientProvider>
  )
}

describe('OrderConfirmModal', () => {
  it('submits the order and navigates to the success screen', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ orderId: 'order-1' }),
    }) as unknown as typeof fetch

    renderModal()

    fireEvent.change(screen.getByPlaceholderText('np. bez cukru'), { target: { value: 'no sugar' } })
    fireEvent.click(screen.getByText('Dopisz do rachunku pokoju'))

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/order-success?orderId=order-1'))

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/orders',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ serviceId: 'service-1', note: 'no sugar', scheduledTime: undefined }),
      })
    )
  })

  it('shows an inline error and keeps the note when the request fails, then retries', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ orderId: 'order-2' }) }) as unknown as typeof fetch

    renderModal()

    fireEvent.change(screen.getByPlaceholderText('np. bez cukru'), { target: { value: 'no sugar' } })
    fireEvent.click(screen.getByText('Dopisz do rachunku pokoju'))

    await waitFor(() => expect(screen.getByText('Nie udało się złożyć zamówienia. Spróbuj ponownie.')).toBeTruthy())
    expect((screen.getByPlaceholderText('np. bez cukru') as HTMLTextAreaElement).value).toBe('no sugar')

    fireEvent.click(screen.getByText('Spróbuj ponownie'))

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/order-success?orderId=order-2'))
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('calls onClose without submitting', () => {
    const onClose = vi.fn()
    global.fetch = vi.fn() as unknown as typeof fetch
    renderModal(onClose)

    fireEvent.click(screen.getByText('Anuluj'))

    expect(onClose).toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
