// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderHook, act, cleanup, waitFor } from '@testing-library/react'
import { useOnlineStatus } from '../use-online-status'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('useOnlineStatus', () => {
  it('reflects navigator.onLine initial value', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(true)
  })

  it('updates to false on an offline event', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
    const { result } = renderHook(() => useOnlineStatus())

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })

    expect(result.current).toBe(false)
  })

  it('updates to true on an online event once the reachability ping succeeds', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
    const { result } = renderHook(() => useOnlineStatus())

    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })

    await waitFor(() => expect(result.current).toBe(true))
    expect(fetch).toHaveBeenCalledWith('/api/health', { cache: 'no-store' })
  })

  it('stays offline on an online event when the reachability ping fails', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    const { result } = renderHook(() => useOnlineStatus())

    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })

    expect(result.current).toBe(false)
  })
})
