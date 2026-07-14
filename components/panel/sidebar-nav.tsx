'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { NavItem } from '@/lib/panel/nav-items'

interface Props {
  items: NavItem[]
}

export function SidebarNav({ items }: Props) {
  const pathname = usePathname()
  const t = useTranslations('panelNav')

  return (
    <aside className="w-60 shrink-0 border-r bg-white">
      <nav className="flex flex-col p-4">
        {items.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={`rounded px-3 py-2 text-sm font-medium ${
                isActive ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {t(item.labelKey)}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
