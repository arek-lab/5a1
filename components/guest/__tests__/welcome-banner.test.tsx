// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { WelcomeBanner } from '../welcome-banner'

afterEach(() => {
  cleanup()
})

describe('WelcomeBanner', () => {
  it('greets the guest by first name when present', () => {
    render(<WelcomeBanner guestFirstName="Anna" roomNumber="204" />)
    expect(screen.getByText('Witaj, Anna!')).toBeTruthy()
  })

  it('falls back to the room number when no name is present', () => {
    render(<WelcomeBanner guestFirstName={null} roomNumber="204" />)
    expect(screen.getByText('Witamy w pokoju 204')).toBeTruthy()
  })

  it('falls back to a generic greeting when neither name nor room number is present', () => {
    render(<WelcomeBanner guestFirstName={null} roomNumber={null} />)
    expect(screen.getByText('Witaj!')).toBeTruthy()
  })
})
