// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { ServiceCard } from '../service-card'
import type { ServiceListItem } from '@/lib/guest/services'
import messages from '@/messages/pl.json'

afterEach(() => {
  cleanup()
})

function renderCard(service: ServiceListItem) {
  return render(
    <NextIntlClientProvider locale="pl" messages={messages}>
      <ServiceCard service={service} category="restaurant" />
    </NextIntlClientProvider>
  )
}

const baseService: ServiceListItem = {
  id: 'service-1',
  name: 'Śniadanie do pokoju',
  priceCents: 4500,
  imageUrl: null,
  isActive: true,
}

describe('ServiceCard', () => {
  it('shows the formatted price and links to the service detail route when active', () => {
    renderCard(baseService)
    expect(screen.getByText('45.00')).toBeTruthy()
    const link = screen.getByRole('link', { name: /Śniadanie do pokoju/ })
    expect(link.getAttribute('href')).toBe('/c/restaurant/service-1')
  })

  it('shows "included" label when price is null', () => {
    renderCard({ ...baseService, priceCents: null })
    expect(screen.getByText('W cenie pobytu')).toBeTruthy()
  })

  it('renders inactive services as non-clickable with an unavailable label', () => {
    renderCard({ ...baseService, isActive: false })
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('Tymczasowo niedostępne')).toBeTruthy()
  })
})
