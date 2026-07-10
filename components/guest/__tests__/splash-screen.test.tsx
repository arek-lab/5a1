// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { act } from 'react'
import { SplashScreen } from '../splash-screen'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('SplashScreen', () => {
  it('is visible immediately after mount', () => {
    const { container } = render(<SplashScreen durationMs={1500} />)
    expect(container.querySelector('img[src="/icons/icon.svg"]')).toBeTruthy()
  })

  it('unmounts itself after the configured duration', () => {
    const { container } = render(<SplashScreen durationMs={1500} />)

    act(() => {
      vi.advanceTimersByTime(1499)
    })
    expect(container.firstChild).not.toBeNull()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(container.firstChild).toBeNull()
  })
})
