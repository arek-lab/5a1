// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { SidebarNav } from '../sidebar-nav'
import messages from '@/messages/pl.json'
import type { NavItem } from '@/lib/panel/nav-items'

const { usePathname } = vi.hoisted(() => ({ usePathname: vi.fn() }))

vi.mock('next/navigation', () => ({ usePathname }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const items: NavItem[] = [
  { href: '/dashboard', labelKey: 'dashboard', resource: 'dashboard' },
  { href: '/services', labelKey: 'services', resource: 'services' },
  { href: '/qr', labelKey: 'qr', resource: 'qr_manage' },
]

function renderNav() {
  return render(
    <NextIntlClientProvider locale="pl" messages={messages}>
      <SidebarNav items={items} />
    </NextIntlClientProvider>
  )
}

describe('SidebarNav', () => {
  it('marks the item matching the current path as active', () => {
    usePathname.mockReturnValue('/services')
    renderNav()
    expect(screen.getByRole('link', { name: 'Usługi' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'Panel główny' }).getAttribute('aria-current')).toBeNull()
  })

  it('marks the item active for a nested path (prefix match)', () => {
    usePathname.mockReturnValue('/qr/print')
    renderNav()
    expect(screen.getByRole('link', { name: 'QR' }).getAttribute('aria-current')).toBe('page')
  })

  it('marks nothing active when path matches no item', () => {
    usePathname.mockReturnValue('/onboarding')
    renderNav()
    for (const label of ['Panel główny', 'Usługi', 'QR']) {
      expect(screen.getByRole('link', { name: label }).getAttribute('aria-current')).toBeNull()
    }
  })
})
