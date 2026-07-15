'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { FAQ_TEMPLATES, type FaqTemplate } from '@/lib/panel/faq-templates'
import { createKnowledgeFromTemplate } from './actions'
import { Button } from '@/components/ui/button'

export default function FaqTemplatePicker() {
  const t = useTranslations()
  const tList = useTranslations('knowledge.list')
  const tErrors = useTranslations('knowledge.form.errors')
  const [error, setError] = useState<string | null>(null)
  const [addedKeys, setAddedKeys] = useState<string[]>([])
  const [isPending, startTransition] = useTransition()

  function handleAdd(template: FaqTemplate) {
    setError(null)
    const formData = new FormData()
    formData.set('template_key', template.key)
    formData.set('question', t(template.questionKey))
    formData.set('content', t(template.contentKey))

    startTransition(async () => {
      const result = await createKnowledgeFromTemplate(formData)
      if (result.error) {
        setError(result.error)
      } else {
        setAddedKeys(prev => [...prev, template.key])
      }
    })
  }

  return (
    <div>
      {error && (
        <p role="alert" className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {tErrors(error)}
        </p>
      )}
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {FAQ_TEMPLATES.map(template => {
          const added = addedKeys.includes(template.key)
          return (
            <li
              key={template.key}
              className="flex items-center justify-between gap-2 rounded-md border border-border bg-panel-surface p-2"
            >
              <span className="font-medium">{t(template.questionKey)}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending || added}
                onClick={() => handleAdd(template)}
              >
                {tList('addFromTemplate')}
              </Button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
