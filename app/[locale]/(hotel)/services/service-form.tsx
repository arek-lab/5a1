'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { SERVICE_CATEGORIES, type ServiceCategory } from '@/lib/panel/service-categories'
import { createCustomService, updateService } from './actions'
import type { ServiceRecord } from './service-list'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Props {
  service?: ServiceRecord
  onSaved?: () => void
}

export default function ServiceForm({ service, onSaved }: Props) {
  const t = useTranslations('services.form')
  const tCategories = useTranslations('services.categories')
  const [name, setName] = useState(service?.name ?? '')
  const [description, setDescription] = useState(service?.description ?? '')
  const [nameEn, setNameEn] = useState(service?.name_en ?? '')
  const [descriptionEn, setDescriptionEn] = useState(service?.description_en ?? '')
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
    formData.set('name_en', nameEn)
    formData.set('description_en', descriptionEn)
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

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(`errors.${error}`)}
        </p>
      )}
      <div className="space-y-1">
        <Label htmlFor="service-name">{t('fields.name')}</Label>
        <Input id="service-name" value={name} onChange={e => setName(e.target.value)} required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="service-description">{t('fields.description')}</Label>
        <Textarea id="service-description" value={description} onChange={e => setDescription(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="service-name-en">{t('fields.nameEn')}</Label>
        <Input id="service-name-en" value={nameEn} onChange={e => setNameEn(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="service-description-en">{t('fields.descriptionEn')}</Label>
        <Textarea id="service-description-en" value={descriptionEn} onChange={e => setDescriptionEn(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="service-category">{t('fields.category')}</Label>
        <Select value={category} onValueChange={value => setCategory(value as ServiceCategory)}>
          <SelectTrigger id="service-category" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SERVICE_CATEGORIES.map(c => (
              <SelectItem key={c} value={c}>{tCategories(c)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={included} onChange={e => setIncluded(e.target.checked)} />
        {t('fields.included')}
      </label>
      {!included && (
        <div className="space-y-1">
          <Label htmlFor="service-price">{t('fields.priceCents')}</Label>
          <Input
            id="service-price"
            type="number"
            min="0"
            step="1"
            value={priceCents}
            onChange={e => setPriceCents(e.target.value)}
          />
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor="service-image-url">{t('fields.imageUrl')}</Label>
        <Input id="service-image-url" value={imageUrl} onChange={e => setImageUrl(e.target.value)} />
      </div>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={isTimeSensitive}
          onChange={e => setIsTimeSensitive(e.target.checked)}
        />
        {t('fields.timeSensitive')}
      </label>
      <Button type="submit" disabled={isPending}>
        {isPending ? t('actions.saving') : t('actions.save')}
      </Button>
    </form>
  )
}
