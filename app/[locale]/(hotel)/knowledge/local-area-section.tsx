'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { deleteKnowledgeEntry } from './actions'
import KnowledgeForm from './knowledge-form'
import type { KnowledgeRecord } from './knowledge-list'
import { Button } from '@/components/ui/button'

interface Props {
  entries: KnowledgeRecord[]
  canEdit: boolean
}

export default function LocalAreaSection({ entries, canEdit }: Props) {
  const t = useTranslations('knowledge')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [addingCustom, setAddingCustom] = useState(false)

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
        <Button
          type="button"
          variant={addingCustom ? 'default' : 'outline'}
          size="sm"
          onClick={() => setAddingCustom(v => !v)}
        >
          {t('local.addCustom')}
        </Button>
      )}

      {canEdit && addingCustom && (
        <div className="rounded-md border border-border bg-panel-bg p-4">
          <KnowledgeForm category="local" onSaved={() => setAddingCustom(false)} />
        </div>
      )}

      {entries.length === 0 && (
        <p className="italic text-panel-ink-muted">{t('local.empty')}</p>
      )}

      <ul className="divide-y divide-border rounded-md border border-border">
        {entries.map(entry => (
          <li key={entry.id} className="p-3">
            {editingId === entry.id ? (
              <KnowledgeForm category="local" entry={entry} onSaved={() => setEditingId(null)} />
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-3">
                <span className="text-sm text-panel-ink-muted">{entry.content}</span>
                {canEdit && (
                  <div className="flex shrink-0 gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditingId(entry.id)}>
                      {t('form.actions.edit')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      onClick={() => handleDelete(entry)}
                    >
                      {t('form.actions.delete')}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
