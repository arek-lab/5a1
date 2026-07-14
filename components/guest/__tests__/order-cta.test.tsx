// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, render, screen, act } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { OrderCta } from '../order-cta'
import type { ServiceDetail } from '@/lib/guest/services'
import type { GuestOrderContext } from '../order-cta'
import messages from '@/messages/pl.json'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

afterEach(() => {
  cleanup()
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
  phoneReception: '+48123456789',
}

function renderCta() {
  return render(
    <NextIntlClientProvider locale="pl" messages={messages}>
      <OrderCta service={service} guestContext={guestContext} />
    </NextIntlClientProvider>
  )
}

describe('OrderCta', () => {
  it('enables "Zamów" while online', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
    renderCta()
    expect((screen.getByText('Zamów').closest('button') as HTMLButtonElement).disabled).toBe(false)
  })

  it('disables "Zamów" while offline', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
    renderCta()

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })

    expect((screen.getByText('Zamów').closest('button') as HTMLButtonElement).disabled).toBe(true)
  })
})
