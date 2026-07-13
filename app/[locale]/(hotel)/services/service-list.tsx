'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { SERVICE_CATEGORIES, type ServiceCategory } from '@/lib/panel/service-categories'
import { toggleServiceActive, toggleServicePin } from './actions'
import ServiceForm from './service-form'
import TemplatePicker from './template-picker'

export type ServiceRecord = {
  id: string
  template_key: string | null
  name: string
  description: string | null
  name_en: string | null
  description_en: string | null
  category: ServiceCategory
  price_cents: number | null
  image_url: string | null
  is_active: boolean
  is_pinned: boolean
  is_time_sensitive: boolean
}

interface Props {
  services: ServiceRecord[]
  canEdit: boolean
}

function statusBadgeClass(variant: 'active' | 'inactive' | 'pinned' | 'timeSensitive') {
  switch (variant) {
    case 'active':
      return 'rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800'
    case 'inactive':
      return 'rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600'
    case 'pinned':
      return 'rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800'
    case 'timeSensitive':
      return 'rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800'
  }
}

const toolbarButtonClass =
  'rounded border px-3 py-1.5 text-sm font-medium hover:bg-gray-100 hover:text-gray-900'
const rowButtonClass =
  'rounded border px-2 py-1 text-sm hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50'

export default function ServiceList({ services, canEdit }: Props) {
  const t = useTranslations('services')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [addingCustom, setAddingCustom] = useState(false)
  const [pickingTemplate, setPickingTemplate] = useState(false)

  function handleToggleActive(service: ServiceRecord) {
    setError(null)
    startTransition(async () => {
      const result = await toggleServiceActive(service.id, !service.is_active)
      if (result.error) setError(result.error)
    })
  }

  function handleTogglePin(service: ServiceRecord) {
    setError(null)
    startTransition(async () => {
      const result = await toggleServicePin(service.id, !service.is_pinned)
      if (result.error) setError(result.error)
    })
  }

  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {t(`form.errors.${error}`)}
        </p>
      )}

      {canEdit && (
        <div className="flex gap-2">
          <button
            type="button"
            className={`${toolbarButtonClass} ${pickingTemplate ? 'bg-blue-600 text-white hover:bg-blue-700' : ''}`}
            onClick={() => setPickingTemplate(v => !v)}
          >
            {t('list.addFromTemplate')}
          </button>
          <button
            type="button"
            className={`${toolbarButtonClass} ${addingCustom ? 'bg-blue-600 text-white hover:bg-blue-700' : ''}`}
            onClick={() => setAddingCustom(v => !v)}
          >
            {t('list.addCustom')}
          </button>
        </div>
      )}

      {canEdit && pickingTemplate && (
        <div className="rounded border bg-gray-50 p-4 text-gray-900">
          <TemplatePicker />
        </div>
      )}
      {canEdit && addingCustom && (
        <div className="rounded border bg-gray-50 p-4 text-gray-900">
          <ServiceForm onSaved={() => setAddingCustom(false)} />
        </div>
      )}

      {services.length === 0 && (
        <p className="italic text-gray-500">{t('list.empty')}</p>
      )}

      {SERVICE_CATEGORIES.map(category => {
        const items = services.filter(s => s.category === category)
        if (items.length === 0) return null

        return (
          <section key={category}>
            <h2 className="mb-2 border-b pb-1 text-lg font-semibold">
              {t(`categories.${category}`)}
            </h2>
            <ul className="divide-y rounded border">
              {items.map(service => (
                <li key={service.id} className="p-3">
                  {editingId === service.id ? (
                    <ServiceForm service={service} onSaved={() => setEditingId(null)} />
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{service.name}</span>
                        <span className={statusBadgeClass(service.is_active ? 'active' : 'inactive')}>
                          {service.is_active ? t('list.activeLabel') : t('list.inactiveLabel')}
                        </span>
                        {service.is_pinned && (
                          <span className={statusBadgeClass('pinned')}>{t('list.pinnedLabel')}</span>
                        )}
                        {service.is_time_sensitive && (
                          <span className={statusBadgeClass('timeSensitive')}>
                            {t('list.timeSensitiveLabel')}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="w-20 text-right text-sm text-gray-600">
                          {service.price_cents === null
                            ? t('list.includedLabel')
                            : (service.price_cents / 100).toFixed(2)}
                        </span>
                        {canEdit && (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className={rowButtonClass}
                              onClick={() => setEditingId(service.id)}
                            >
                              {t('form.actions.edit')}
                            </button>
                            <button
                              type="button"
                              className={rowButtonClass}
                              disabled={isPending}
                              onClick={() => handleToggleActive(service)}
                            >
                              {service.is_active ? t('form.actions.deactivate') : t('form.actions.activate')}
                            </button>
                            <button
                              type="button"
                              className={rowButtonClass}
                              disabled={isPending}
                              onClick={() => handleTogglePin(service)}
                            >
                              {service.is_pinned ? t('form.actions.unpin') : t('form.actions.pin')}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
