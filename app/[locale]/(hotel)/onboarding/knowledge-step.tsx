'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'

export type FaqEntrySummary = {
  id: string
  question: string | null
}

interface Props {
  faqEntries: FaqEntrySummary[]
  canEdit: boolean
}

export default function KnowledgeStep({ faqEntries, canEdit }: Props) {
  const t = useTranslations('onboarding.knowledge')

  return (
    <div className="space-y-4">
      {faqEntries.length === 0 ? (
        <p className="italic text-gray-500">{t('empty')}</p>
      ) : (
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {faqEntries.map(entry => (
            <li key={entry.id}>{entry.question}</li>
          ))}
        </ul>
      )}
      {canEdit && (
        <Link
          href="/knowledge"
          className="inline-block rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          {t('manageButton')}
        </Link>
      )}
    </div>
  )
}
