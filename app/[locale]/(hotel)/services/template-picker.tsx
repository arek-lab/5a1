'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { SERVICE_TEMPLATES, type ServiceTemplate } from '@/lib/panel/service-templates'
import { createServiceFromTemplate } from './actions'
import { Button } from '@/components/ui/button'

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
        <p role="alert" className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {tErrors(error)}
        </p>
      )}
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {SERVICE_TEMPLATES.map(template => {
          const added = addedKeys.includes(template.key)
          return (
            <li
              key={template.key}
              className="flex items-center justify-between gap-2 rounded-md border border-border bg-panel-surface p-2"
            >
              <div className="flex flex-col">
                <span className="font-medium">{t(template.nameKey)}</span>
                <span className="text-xs text-panel-ink-muted">{tCategories(template.category)}</span>
              </div>
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
