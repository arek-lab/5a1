'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'
import {
  subscribeToPreference,
  getPreferenceSnapshot,
  getPreferenceServerSnapshot,
  applyColorScheme,
  setPreference,
  type ColorSchemePreference,
} from '@/lib/theme/color-scheme'
import { Button } from '@/components/ui/button'

const CYCLE: Record<ColorSchemePreference, ColorSchemePreference> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
}

function ThemeIcon({ preference }: { preference: ColorSchemePreference }) {
  if (preference === 'light') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
        <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.75" />
        <path
          d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    )
  }
  if (preference === 'dark') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
        <path
          d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <rect x="3" y="4" width="18" height="12" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path d="M8 20h8M12 16v4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}

export function ThemeToggle() {
  const t = useTranslations('panelNav.theme')
  const preference = useSyncExternalStore(
    subscribeToPreference,
    getPreferenceSnapshot,
    getPreferenceServerSnapshot
  )

  useEffect(() => {
    if (preference !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyColorScheme('system')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [preference])

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={() => setPreference(CYCLE[preference])}
      aria-label={t('label', { mode: t(preference) })}
    >
      <ThemeIcon preference={preference} />
    </Button>
  )
}
