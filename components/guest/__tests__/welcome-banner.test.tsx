// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { WelcomeBanner } from '../welcome-banner'
import messages from '@/messages/pl.json'

afterEach(() => {
  cleanup()
})

function renderBanner(props: Parameters<typeof WelcomeBanner>[0]) {
  return render(
    <NextIntlClientProvider locale="pl" messages={messages}>
      <WelcomeBanner {...props} />
    </NextIntlClientProvider>
  )
}

describe('WelcomeBanner', () => {
  it('greets the guest by first name when present', () => {
    renderBanner({ guestFirstName: 'Anna', roomNumber: '204' })
    expect(screen.getByText('Witaj, Anna!')).toBeTruthy()
  })

  it('falls back to the room number when no name is present', () => {
    renderBanner({ guestFirstName: null, roomNumber: '204' })
    expect(screen.getByText('Witamy w pokoju 204')).toBeTruthy()
  })

  it('shows a scan-room CTA when neither name nor room number is present', () => {
    renderBanner({ guestFirstName: null, roomNumber: null })
    const link = screen.getByRole('link', { name: 'Skanuj kod pokoju' })
    expect(link).toBeTruthy()
    expect(link.getAttribute('href')).toBe('/scan')
  })
})
