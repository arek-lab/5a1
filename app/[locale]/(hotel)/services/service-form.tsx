'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { SERVICE_CATEGORIES, type ServiceCategory } from '@/lib/panel/service-categories'
import { createCustomService, updateService } from './actions'
import type { ServiceRecord } from './service-list'

interface Props {
  service?: ServiceRecord
  onSaved?: () => void
}

export default function ServiceForm({ service, onSaved }: Props) {
  const t = useTranslations('services.form')
  const tCategories = useTranslations('services.categories')
  const [name, setName] = useState(service?.name ?? '')
  const [description, setDescription] = useState(service?.description ?? '')
  const [category, setCategory] = useState<ServiceCategory>(service?.category ?? SERVICE_CATEGORIES[0])
  const [included, setIncluded] = useState(service ? service.price_cents === null : false)
  const [priceCents, setPriceCents] = useState(
    service?.price_cents != null ? String(service.price_cents) : ''
  )
  const [imageUrl, setImageUrl] = useState(service?.image_url ?? '')
  const [isTimeSensitive, setIsTimeSensitive] = useState(service?.is_time_sensitive ?? false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const formData = new FormData()
    if (service) formData.set('id', service.id)
    formData.set('name', name)
    formData.set('description', description)
    formData.set('category', category)
    formData.set('price_cents', included ? '' : priceCents)
    formData.set('image_url', imageUrl)
    formData.set('is_time_sensitive', isTimeSensitive ? 'on' : 'off')

    startTransition(async () => {
      const action = service ? updateService : createCustomService
      const result = await action(formData)
      if (result.error) {
        setError(result.error)
      } else {
        onSaved?.()
      }
    })
  }

  const inputClass = 'w-full rounded border px-2 py-1'
  const labelClass = 'flex flex-col gap-1 text-sm font-medium'

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {t(`errors.${error}`)}
        </p>
      )}
      <label className={labelClass}>
        {t('fields.name')}
        <input className={inputClass} value={name} onChange={e => setName(e.target.value)} required />
      </label>
      <label className={labelClass}>
        {t('fields.description')}
        <textarea className={inputClass} value={description} onChange={e => setDescription(e.target.value)} />
      </label>
      <label className={labelClass}>
        {t('fields.category')}
        <select
          className={inputClass}
          value={category}
          onChange={e => setCategory(e.target.value as ServiceCategory)}
        >
          {SERVICE_CATEGORIES.map(c => (
            <option key={c} value={c}>{tCategories(c)}</option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={included} onChange={e => setIncluded(e.target.checked)} />
        {t('fields.included')}
      </label>
      {!included && (
        <label className={labelClass}>
          {t('fields.priceCents')}
          <input
            className={inputClass}
            type="number"
            min="0"
            step="1"
            value={priceCents}
            onChange={e => setPriceCents(e.target.value)}
          />
        </label>
      )}
      <label className={labelClass}>
        {t('fields.imageUrl')}
        <input className={inputClass} value={imageUrl} onChange={e => setImageUrl(e.target.value)} />
      </label>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={isTimeSensitive}
          onChange={e => setIsTimeSensitive(e.target.checked)}
        />
        {t('fields.timeSensitive')}
      </label>
      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {isPending ? t('actions.saving') : t('actions.save')}
      </button>
    </form>
  )
}
