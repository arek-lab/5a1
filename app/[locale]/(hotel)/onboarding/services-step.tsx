'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'

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
        <p className="italic text-gray-500">{t('empty')}</p>
      ) : (
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {activeServices.map(service => (
            <li key={service.id}>{service.name}</li>
          ))}
        </ul>
      )}
      {canEdit && (
        <Link
          href="/services"
          className="inline-block rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          {t('manageButton')}
        </Link>
      )}
    </div>
  )
}
