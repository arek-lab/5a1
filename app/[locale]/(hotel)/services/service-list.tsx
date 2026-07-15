'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { SERVICE_CATEGORIES, type ServiceCategory } from '@/lib/panel/service-categories'
import { toggleServiceActive, toggleServicePin } from './actions'
import ServiceForm from './service-form'
import TemplatePicker from './template-picker'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

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

const actionButtonClass = 'h-6 flex-1 px-2 text-[11px]'

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
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(`form.errors.${error}`)}
        </p>
      )}

      {canEdit && (
        <div className="flex gap-2">
          <Button
            type="button"
            variant={pickingTemplate ? 'default' : 'outline'}
            size="sm"
            onClick={() => setPickingTemplate(v => !v)}
          >
            {t('list.addFromTemplate')}
          </Button>
          <Button
            type="button"
            variant={addingCustom ? 'default' : 'outline'}
            size="sm"
            onClick={() => setAddingCustom(v => !v)}
          >
            {t('list.addCustom')}
          </Button>
        </div>
      )}

      {canEdit && pickingTemplate && (
        <div className="rounded-md border border-border bg-panel-bg p-4">
          <TemplatePicker />
        </div>
      )}
      {canEdit && addingCustom && (
        <div className="rounded-md border border-border bg-panel-bg p-4">
          <ServiceForm onSaved={() => setAddingCustom(false)} />
        </div>
      )}

      {services.length === 0 && (
        <p className="italic text-panel-ink-muted">{t('list.empty')}</p>
      )}

      {SERVICE_CATEGORIES.map(category => {
        const items = services.filter(s => s.category === category)
        if (items.length === 0) return null

        return (
          <section key={category}>
            <h2 className="mb-2 border-b border-border pb-1 text-lg font-semibold">
              {t(`categories.${category}`)}
            </h2>
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead>{t('list.columns.name')}</TableHead>
                  <TableHead className="w-20 text-right">{t('list.columns.price')}</TableHead>
                  {canEdit && <TableHead className="w-[23rem] text-right">{t('list.columns.actions')}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(service => (
                  <TableRow key={service.id} className="h-10">
                    {editingId === service.id ? (
                      <TableCell colSpan={canEdit ? 3 : 2} className="whitespace-normal py-3">
                        <ServiceForm service={service} onSaved={() => setEditingId(null)} />
                      </TableCell>
                    ) : (
                      <>
                        <TableCell className="whitespace-normal">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{service.name}</span>
                            <Badge variant={service.is_active ? 'default' : 'secondary'}>
                              {service.is_active ? t('list.activeLabel') : t('list.inactiveLabel')}
                            </Badge>
                            {service.is_pinned && (
                              <Badge variant="outline">{t('list.pinnedLabel')}</Badge>
                            )}
                            {service.is_time_sensitive && (
                              <Badge variant="outline">{t('list.timeSensitiveLabel')}</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-panel-ink-muted">
                          {service.price_cents === null
                            ? t('list.includedLabel')
                            : (service.price_cents / 100).toFixed(2)}
                        </TableCell>
                        {canEdit && (
                          <TableCell>
                            <div className="flex gap-1.5 px-[5px]">
                              <Button
                                type="button"
                                variant="outline"
                                className={actionButtonClass}
                                onClick={() => setEditingId(service.id)}
                              >
                                {t('form.actions.edit')}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                className={actionButtonClass}
                                disabled={isPending}
                                onClick={() => handleToggleActive(service)}
                              >
                                {service.is_active ? t('form.actions.deactivate') : t('form.actions.activate')}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                className={actionButtonClass}
                                disabled={isPending}
                                onClick={() => handleTogglePin(service)}
                              >
                                {service.is_pinned ? t('form.actions.unpin') : t('form.actions.pin')}
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        )
      })}
    </div>
  )
}
