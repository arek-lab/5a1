// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { BottomNav } from '../bottom-nav'
import messages from '@/messages/pl.json'

const { usePathname } = vi.hoisted(() => ({ usePathname: vi.fn() }))

vi.mock('next/navigation', () => ({ usePathname }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderNav(authLevel: number) {
  return render(
    <NextIntlClientProvider locale="pl" messages={messages}>
      <BottomNav authLevel={authLevel} />
    </NextIntlClientProvider>
  )
}

describe('BottomNav', () => {
  it('renders nothing on /scan', () => {
    usePathname.mockReturnValue('/scan')
    const { container } = renderNav(2)
    expect(container.firstChild).toBeNull()
  })

  it('marks the tab matching the current path as active', () => {
    usePathname.mockReturnValue('/concierge')
    renderNav(2)
    expect(screen.getByRole('link', { name: 'Concierge' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'Dziś' }).getAttribute('aria-current')).toBeNull()
  })

  it('links room-requiring tabs to their real route when authLevel >= 2', () => {
    usePathname.mockReturnValue('/')
    renderNav(2)
    expect(screen.getByRole('link', { name: 'Udogodnienia' }).getAttribute('href')).toBe('/amenities')
    expect(screen.getByRole('link', { name: 'Mój pobyt' }).getAttribute('href')).toBe('/my-stay')
    expect(screen.getByRole('link', { name: 'Odkrywaj' }).getAttribute('href')).toBe('/discover')
  })

  it('redirects room-requiring tabs to /room-required when authLevel < 2', () => {
    usePathname.mockReturnValue('/')
    renderNav(1)
    expect(screen.getByRole('link', { name: 'Udogodnienia' }).getAttribute('href')).toBe('/room-required')
    expect(screen.getByRole('link', { name: 'Mój pobyt' }).getAttribute('href')).toBe('/room-required')
    expect(screen.getByRole('link', { name: 'Odkrywaj' }).getAttribute('href')).toBe('/room-required')
    expect(screen.getByRole('link', { name: 'Dziś' }).getAttribute('href')).toBe('/')
    expect(screen.getByRole('link', { name: 'Concierge' }).getAttribute('href')).toBe('/concierge')
  })
})
