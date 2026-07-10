// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { WelcomeBanner } from '../welcome-banner'

afterEach(() => {
  cleanup()
})

describe('WelcomeBanner', () => {
  it('greets the guest by first name when present', () => {
    render(<WelcomeBanner guestFirstName="Anna" />)
    expect(screen.getByText('Witaj, Anna!')).toBeTruthy()
  })

  it('falls back to a generic greeting when no name is present', () => {
    render(<WelcomeBanner guestFirstName={null} />)
    expect(screen.getByText('Witaj!')).toBeTruthy()
  })
})
