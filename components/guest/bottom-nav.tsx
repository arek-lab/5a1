'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'

interface NavItem {
  href: string
  labelKey: string
  requiresRoom: boolean
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', labelKey: 'today', requiresRoom: false },
  { href: '/amenities', labelKey: 'amenities', requiresRoom: true },
  { href: '/concierge', labelKey: 'concierge', requiresRoom: false },
  { href: '/my-stay', labelKey: 'myStay', requiresRoom: true },
  { href: '/discover', labelKey: 'discover', requiresRoom: true },
]

const ROOM_REQUIRED_PATH = '/room-required'
const ROOM_LEVEL = 2

const HIDDEN_PATH_PATTERN = /\/scan\/?$/

export function BottomNav({ authLevel }: { authLevel: number }) {
  const pathname = usePathname()
  const t = useTranslations('guest.nav')

  if (HIDDEN_PATH_PATTERN.test(pathname)) {
    return null
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-white">
      {NAV_ITEMS.map((item) => {
        const locked = item.requiresRoom && authLevel < ROOM_LEVEL
        const href = locked ? ROOM_REQUIRED_PATH : item.href
        const isActive = pathname === item.href
        return (
          <Link
            key={item.href}
            href={href}
            aria-current={isActive ? 'page' : undefined}
            className={`flex min-h-[44px] flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-xs font-medium ${
              isActive ? 'text-gray-900' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            {t(item.labelKey)}
          </Link>
        )
      })}
    </nav>
  )
}
