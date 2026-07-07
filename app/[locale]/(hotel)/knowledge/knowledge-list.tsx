'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import type { KnowledgeCategory } from '@/lib/panel/knowledge-categories'
import { deleteKnowledgeEntry } from './actions'
import KnowledgeForm from './knowledge-form'
import FaqTemplatePicker from './faq-template-picker'

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

const toolbarButtonClass =
  'rounded border px-3 py-1.5 text-sm font-medium hover:bg-gray-100 hover:text-gray-900'
const rowButtonClass =
  'rounded border px-2 py-1 text-sm hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50'

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
          <FaqTemplatePicker />
        </div>
      )}
      {canEdit && addingCustom && (
        <div className="rounded border bg-gray-50 p-4 text-gray-900">
          <KnowledgeForm category="faq" onSaved={() => setAddingCustom(false)} />
        </div>
      )}

      {entries.length === 0 && (
        <p className="italic text-gray-500">{t('list.empty')}</p>
      )}

      <ul className="divide-y rounded border">
        {entries.map(entry => (
          <li key={entry.id} className="p-3">
            {editingId === entry.id ? (
              <KnowledgeForm category="faq" entry={entry} onSaved={() => setEditingId(null)} />
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col">
                  <span className="font-medium">{entry.question}</span>
                  <span className="text-sm text-gray-600">{entry.content}</span>
                </div>
                {canEdit && (
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      className={rowButtonClass}
                      onClick={() => setEditingId(entry.id)}
                    >
                      {t('form.actions.edit')}
                    </button>
                    <button
                      type="button"
                      className={rowButtonClass}
                      disabled={isPending}
                      onClick={() => handleDelete(entry)}
                    >
                      {t('form.actions.delete')}
                    </button>
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
