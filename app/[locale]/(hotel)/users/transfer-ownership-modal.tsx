'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { transferOwnership } from './actions'

export type TransferCandidate = {
  id: string
  email: string
}

interface Props {
  candidates: TransferCandidate[]
  onDone?: () => void
}

export default function TransferOwnershipModal({ candidates, onDone }: Props) {
  const t = useTranslations('users.transfer')
  const [open, setOpen] = useState(false)
  const [targetId, setTargetId] = useState(candidates[0]?.id ?? '')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const target = candidates.find(c => c.id === targetId)
  const confirmationMatches = target != null && confirmation.trim() === target.email

  function handleClose() {
    setOpen(false)
    setConfirmation('')
    setError(null)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!confirmationMatches) return
    setError(null)

    startTransition(async () => {
      const result = await transferOwnership(targetId)
      if (result.error) {
        setError(result.error)
      } else {
        handleClose()
        onDone?.()
      }
    })
  }

  if (candidates.length === 0) return null

  return (
    <div>
      <button
        type="button"
        className="rounded border border-amber-400 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-50"
        onClick={() => setOpen(true)}
      >
        {t('toggle')}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded bg-white p-5 text-gray-900 shadow-lg">
            <h2 className="mb-3 text-lg font-semibold">{t('title')}</h2>
            <p className="mb-4 text-sm text-gray-600">{t('warning')}</p>

            <form onSubmit={handleSubmit} className="space-y-3">
              {error && (
                <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {t(`errors.${error}`)}
                </p>
              )}

              <label className="flex flex-col gap-1 text-sm font-medium">
                {t('fields.target')}
                <select
                  className="w-full rounded border px-2 py-1"
                  value={targetId}
                  onChange={e => {
                    setTargetId(e.target.value)
                    setConfirmation('')
                  }}
                >
                  {candidates.map(c => (
                    <option key={c.id} value={c.id}>{c.email}</option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-sm font-medium">
                {t('fields.confirmation', { email: target?.email ?? '' })}
                <input
                  className="w-full rounded border px-2 py-1"
                  type="text"
                  value={confirmation}
                  onChange={e => setConfirmation(e.target.value)}
                  autoComplete="off"
                />
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="rounded border px-3 py-1.5 text-sm hover:bg-gray-100"
                  onClick={handleClose}
                >
                  {t('actions.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isPending || !confirmationMatches}
                  className="rounded bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {isPending ? t('actions.sending') : t('actions.confirm')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
