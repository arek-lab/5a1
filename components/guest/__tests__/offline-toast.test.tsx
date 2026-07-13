// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen, act } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { OfflineToast } from '../offline-toast'
import messages from '@/messages/pl.json'

afterEach(() => {
  cleanup()
})

function renderToast() {
  return render(
    <NextIntlClientProvider locale="pl" messages={messages}>
      <OfflineToast />
    </NextIntlClientProvider>
  )
}

describe('OfflineToast', () => {
  it('renders nothing while online', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
    renderToast()
    expect(screen.queryByText(messages.guest.offline.toastMessage)).toBeNull()
  })

  it('renders the toast message when offline', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
    renderToast()

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })

    expect(screen.getByText(messages.guest.offline.toastMessage)).toBeTruthy()
  })
})
