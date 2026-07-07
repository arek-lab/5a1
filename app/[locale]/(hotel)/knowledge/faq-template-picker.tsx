'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { FAQ_TEMPLATES, type FaqTemplate } from '@/lib/panel/faq-templates'
import { createKnowledgeFromTemplate } from './actions'

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
        <p role="alert" className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {tErrors(error)}
        </p>
      )}
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {FAQ_TEMPLATES.map(template => {
          const added = addedKeys.includes(template.key)
          return (
            <li
              key={template.key}
              className="flex items-center justify-between gap-2 rounded border bg-white p-2 text-gray-900"
            >
              <span className="font-medium">{t(template.questionKey)}</span>
              <button
                type="button"
                className="rounded border px-2 py-1 text-sm text-gray-900 hover:bg-gray-100 disabled:opacity-50"
                disabled={isPending || added}
                onClick={() => handleAdd(template)}
              >
                {tList('addFromTemplate')}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
