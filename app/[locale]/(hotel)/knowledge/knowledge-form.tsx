'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import type { KnowledgeCategory } from '@/lib/panel/knowledge-categories'
import { createKnowledgeEntry, updateKnowledgeEntry } from './actions'
import type { KnowledgeRecord } from './knowledge-list'

interface Props {
  category: KnowledgeCategory
  entry?: KnowledgeRecord
  onSaved?: () => void
}

function toDateInputValue(value: string | null): string {
  if (!value) return ''
  return value.slice(0, 10)
}

export default function KnowledgeForm({ category, entry, onSaved }: Props) {
  const t = useTranslations('knowledge.form')
  const [question, setQuestion] = useState(entry?.question ?? '')
  const [content, setContent] = useState(entry?.content ?? '')
  const [language, setLanguage] = useState(entry?.language ?? 'pl')
  const [validFrom, setValidFrom] = useState(toDateInputValue(entry?.valid_from ?? null))
  const [validUntil, setValidUntil] = useState(toDateInputValue(entry?.valid_until ?? null))
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const formData = new FormData()
    if (entry) formData.set('id', entry.id)
    formData.set('question', question)
    formData.set('content', content)
    formData.set('category', category)
    formData.set('language', language)
    formData.set('valid_from', validFrom)
    formData.set('valid_until', validUntil)

    startTransition(async () => {
      const action = entry ? updateKnowledgeEntry : createKnowledgeEntry
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
      {category === 'faq' && (
        <label className={labelClass}>
          {t('fields.question')}
          <input className={inputClass} value={question} onChange={e => setQuestion(e.target.value)} required />
        </label>
      )}
      <label className={labelClass}>
        {t('fields.content')}
        <textarea className={inputClass} value={content} onChange={e => setContent(e.target.value)} required />
      </label>
      <label className={labelClass}>
        {t('fields.language')}
        <select className={inputClass} value={language} onChange={e => setLanguage(e.target.value)}>
          <option value="pl">PL</option>
          <option value="en">EN</option>
        </select>
      </label>
      <label className={labelClass}>
        {t('fields.validFrom')}
        <input
          className={inputClass}
          type="date"
          value={validFrom}
          onChange={e => setValidFrom(e.target.value)}
        />
      </label>
      <label className={labelClass}>
        {t('fields.validUntil')}
        <input
          className={inputClass}
          type="date"
          value={validUntil}
          onChange={e => setValidUntil(e.target.value)}
        />
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
