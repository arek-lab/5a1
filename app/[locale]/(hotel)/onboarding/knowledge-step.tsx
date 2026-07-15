'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'

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
        <p className="italic text-panel-ink-muted">{t('empty')}</p>
      ) : (
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {faqEntries.map(entry => (
            <li key={entry.id}>{entry.question}</li>
          ))}
        </ul>
      )}
      {canEdit && (
        <Button asChild size="sm">
          <Link href="/knowledge">{t('manageButton')}</Link>
        </Button>
      )}
    </div>
  )
}
