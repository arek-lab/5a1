'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'

export type ActiveServiceSummary = {
  id: string
  name: string
}

interface Props {
  activeServices: ActiveServiceSummary[]
  canEdit: boolean
}

export default function ServicesStep({ activeServices, canEdit }: Props) {
  const t = useTranslations('onboarding.services')

  return (
    <div className="space-y-4">
      {activeServices.length === 0 ? (
        <p className="italic text-panel-ink-muted">{t('empty')}</p>
      ) : (
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {activeServices.map(service => (
            <li key={service.id}>{service.name}</li>
          ))}
        </ul>
      )}
      {canEdit && (
        <Button asChild size="sm">
          <Link href="/services">{t('manageButton')}</Link>
        </Button>
      )}
    </div>
  )
}
