'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { SERVICE_TEMPLATES, type ServiceTemplate } from '@/lib/panel/service-templates'
import { createServiceFromTemplate } from './actions'

export default function TemplatePicker() {
  const t = useTranslations()
  const tList = useTranslations('services.list')
  const tErrors = useTranslations('services.form.errors')
  const tCategories = useTranslations('services.categories')
  const [error, setError] = useState<string | null>(null)
  const [addedKeys, setAddedKeys] = useState<string[]>([])
  const [isPending, startTransition] = useTransition()

  function handleAdd(template: ServiceTemplate) {
    setError(null)
    const formData = new FormData()
    formData.set('template_key', template.key)
    formData.set('name', t(template.nameKey))
    formData.set('description', t(template.descriptionKey))

    startTransition(async () => {
      const result = await createServiceFromTemplate(formData)
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
        {SERVICE_TEMPLATES.map(template => {
          const added = addedKeys.includes(template.key)
          return (
            <li
              key={template.key}
              className="flex items-center justify-between gap-2 rounded border bg-white p-2 text-gray-900"
            >
              <div className="flex flex-col">
                <span className="font-medium">{t(template.nameKey)}</span>
                <span className="text-xs text-gray-500">{tCategories(template.category)}</span>
              </div>
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
