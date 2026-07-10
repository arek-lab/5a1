// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { PolecamySection, shouldShowPolecamy } from '../polecamy-section'
import type { PinnedService } from '@/lib/guest/services'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

const services: PinnedService[] = [
  { id: 's1', name: 'Massage', category: 'spa', priceCents: 5000, imageUrl: null },
]

describe('shouldShowPolecamy', () => {
  it('shows when no localStorage entry exists', () => {
    expect(shouldShowPolecamy('sess-1', Date.now(), () => null)).toBe(true)
  })

  it('hides when the entry is less than 24h old', () => {
    const now = Date.now()
    const seenAt = now - 60_000
    expect(shouldShowPolecamy('sess-1', now, () => String(seenAt))).toBe(false)
  })

  it('shows when the entry is more than 24h old', () => {
    const now = Date.now()
    const seenAt = now - 25 * 60 * 60 * 1000
    expect(shouldShowPolecamy('sess-1', now, () => String(seenAt))).toBe(true)
  })
})

describe('PolecamySection', () => {
  it('renders pinned services on first visit and writes the seen timestamp', async () => {
    render(<PolecamySection services={services} sessionId="sess-1" hotelName="Hotel Test" />)

    expect(await screen.findByText('Massage')).toBeTruthy()
    expect(window.localStorage.getItem('polecamy_seen_sess-1')).not.toBeNull()
  })

  it('renders nothing when the frequency cap is active', async () => {
    window.localStorage.setItem('polecamy_seen_sess-1', String(Date.now()))

    const { container } = render(
      <PolecamySection services={services} sessionId="sess-1" hotelName="Hotel Test" />
    )

    await waitFor(() => expect(screen.queryByText('Massage')).toBeNull())
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when there are no pinned services', async () => {
    const { container } = render(
      <PolecamySection services={[]} sessionId="sess-1" hotelName="Hotel Test" />
    )

    await waitFor(() => expect(container.firstChild).toBeNull())
  })
})
