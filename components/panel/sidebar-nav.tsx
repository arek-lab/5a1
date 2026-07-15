'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import type { NavItem } from '@/lib/panel/nav-items'

interface Props {
  items: NavItem[]
  children?: React.ReactNode
}

export function SidebarNav({ items, children }: Props) {
  const pathname = usePathname()
  const t = useTranslations('panelNav')

  return (
    <aside className="flex w-60 shrink-0 flex-col overflow-y-auto border-r border-border bg-panel-surface">
      <nav className="flex flex-col p-4">
        {items.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'rounded-md px-3 py-2 text-sm font-medium',
                isActive
                  ? 'bg-panel-bg text-panel-ink'
                  : 'text-panel-ink-muted hover:bg-panel-bg hover:text-panel-ink'
              )}
            >
              {t(item.labelKey)}
            </Link>
          )
        })}
      </nav>
      {children && (
        <div className="mt-auto flex flex-col gap-2 border-t border-border p-4">{children}</div>
      )}
    </aside>
  )
}
