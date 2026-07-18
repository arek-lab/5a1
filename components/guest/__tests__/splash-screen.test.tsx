// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { act } from 'react'
import { SplashScreen } from '../splash-screen'

beforeEach(() => {
  vi.useFakeTimers()
  sessionStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('SplashScreen', () => {
  it('shows once per browser session, marking the sessionStorage flag', () => {
    const { container } = render(<SplashScreen durationMs={700} fadeMs={300} />)

    expect(container.querySelector('img[src="/icons/icon.svg"]')).toBeTruthy()
    expect(sessionStorage.getItem('guest-splash-shown')).toBe('1')
  })

  it('fades out after the configured duration and unmounts after the fade', () => {
    const { container } = render(<SplashScreen durationMs={700} fadeMs={300} />)

    act(() => {
      vi.advanceTimersByTime(699)
    })
    expect(container.firstChild).not.toBeNull()
    expect((container.firstChild as HTMLElement).className).toContain('opacity-100')

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect((container.firstChild as HTMLElement).className).toContain('opacity-0')

    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when the session has already seen the splash', () => {
    sessionStorage.setItem('guest-splash-shown', '1')

    const { container } = render(<SplashScreen durationMs={700} fadeMs={300} />)

    expect(container.firstChild).toBeNull()
  })
})
