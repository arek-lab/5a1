'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import type { KnowledgeCategory } from '@/lib/panel/knowledge-categories'
import { deleteKnowledgeEntry } from './actions'
import KnowledgeForm from './knowledge-form'
import FaqTemplatePicker from './faq-template-picker'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export type KnowledgeRecord = {
  id: string
  question: string | null
  content: string
  category: KnowledgeCategory
  language: string
  valid_from: string | null
  valid_until: string | null
  content_hash: string
}

interface Props {
  entries: KnowledgeRecord[]
  canEdit: boolean
}

const actionButtonClass = 'h-6 flex-1 px-2 text-[11px]'

export default function KnowledgeList({ entries, canEdit }: Props) {
  const t = useTranslations('knowledge')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [addingCustom, setAddingCustom] = useState(false)
  const [pickingTemplate, setPickingTemplate] = useState(false)

  function handleDelete(entry: KnowledgeRecord) {
    if (!window.confirm(t('form.actions.deleteConfirm'))) return
    setError(null)
    startTransition(async () => {
      const result = await deleteKnowledgeEntry(entry.id)
      if (result.error) setError(result.error)
    })
  }

  return (
    <div className="space-y-4">
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
          <FaqTemplatePicker />
        </div>
      )}
      {canEdit && addingCustom && (
        <div className="rounded-md border border-border bg-panel-bg p-4">
          <KnowledgeForm category="faq" onSaved={() => setAddingCustom(false)} />
        </div>
      )}

      {entries.length === 0 && (
        <p className="italic text-panel-ink-muted">{t('list.empty')}</p>
      )}

      {entries.length > 0 && (
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead>{t('list.columns.question')}</TableHead>
              {canEdit && <TableHead className="w-48 text-right">{t('list.columns.actions')}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map(entry => (
              <TableRow key={entry.id} className="h-10">
                {editingId === entry.id ? (
                  <TableCell colSpan={canEdit ? 2 : 1} className="whitespace-normal py-3">
                    <KnowledgeForm category="faq" entry={entry} onSaved={() => setEditingId(null)} />
                  </TableCell>
                ) : (
                  <>
                    <TableCell className="whitespace-normal">
                      <div className="flex flex-col">
                        <span className="font-medium">{entry.question}</span>
                        <span className="text-sm text-panel-ink-muted">{entry.content}</span>
                      </div>
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        <div className="flex gap-1.5 px-[5px]">
                          <Button type="button" variant="outline" className={actionButtonClass} onClick={() => setEditingId(entry.id)}>
                            {t('form.actions.edit')}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className={actionButtonClass}
                            disabled={isPending}
                            onClick={() => handleDelete(entry)}
                          >
                            {t('form.actions.delete')}
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
      )}
    </div>
  )
}
