'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import type { KnowledgeCategory } from '@/lib/panel/knowledge-categories'
import { createKnowledgeEntry, updateKnowledgeEntry } from './actions'
import type { KnowledgeRecord } from './knowledge-list'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

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

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(`errors.${error}`)}
        </p>
      )}
      {category === 'faq' && (
        <div className="space-y-1">
          <Label htmlFor="knowledge-question">{t('fields.question')}</Label>
          <Input id="knowledge-question" value={question} onChange={e => setQuestion(e.target.value)} required />
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor="knowledge-content">{t('fields.content')}</Label>
        <Textarea id="knowledge-content" value={content} onChange={e => setContent(e.target.value)} required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="knowledge-language">{t('fields.language')}</Label>
        <Select value={language} onValueChange={setLanguage}>
          <SelectTrigger id="knowledge-language" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pl">PL</SelectItem>
            <SelectItem value="en">EN</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="knowledge-valid-from">{t('fields.validFrom')}</Label>
        <Input
          id="knowledge-valid-from"
          type="date"
          value={validFrom}
          onChange={e => setValidFrom(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="knowledge-valid-until">{t('fields.validUntil')}</Label>
        <Input
          id="knowledge-valid-until"
          type="date"
          value={validUntil}
          onChange={e => setValidUntil(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? t('actions.saving') : t('actions.save')}
      </Button>
    </form>
  )
}
