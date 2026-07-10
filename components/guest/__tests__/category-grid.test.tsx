// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { CategoryGrid } from '../category-grid'
import messages from '@/messages/pl.json'

afterEach(() => {
  cleanup()
})

function renderGrid(visibleCategories: Parameters<typeof CategoryGrid>[0]['visibleCategories']) {
  return render(
    <NextIntlClientProvider locale="pl" messages={messages}>
      <CategoryGrid visibleCategories={visibleCategories} />
    </NextIntlClientProvider>
  )
}

describe('CategoryGrid', () => {
  it('renders only the visible categories', () => {
    renderGrid(['restaurant', 'spa'])
    expect(screen.getByText('Restauracja i bar')).toBeTruthy()
    expect(screen.getByText('Spa i wellness')).toBeTruthy()
    expect(screen.queryByText('Transport')).toBeNull()
  })

  it('links each category tile to its /c/[category] route', () => {
    renderGrid(['restaurant'])
    const link = screen.getByRole('link', { name: /Restauracja i bar/ })
    expect(link.getAttribute('href')).toBe('/c/restaurant')
  })

  it('renders nothing when no categories are visible', () => {
    const { container } = renderGrid([])
    expect(container.querySelectorAll('a').length).toBe(0)
  })
})
