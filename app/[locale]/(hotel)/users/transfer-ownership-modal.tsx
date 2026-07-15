'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { transferOwnership } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

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
    <Dialog open={open} onOpenChange={value => (value ? setOpen(true) : handleClose())}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="border-panel-warning/50 text-panel-warning hover:bg-panel-warning/10"
        >
          {t('toggle')}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('warning')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          {error && (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {t(`errors.${error}`)}
            </p>
          )}

          <div className="space-y-1">
            <Label htmlFor="transfer-target">{t('fields.target')}</Label>
            <Select
              value={targetId}
              onValueChange={value => {
                setTargetId(value)
                setConfirmation('')
              }}
            >
              <SelectTrigger id="transfer-target" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {candidates.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="transfer-confirmation">{t('fields.confirmation', { email: target?.email ?? '' })}</Label>
            <Input
              id="transfer-confirmation"
              type="text"
              value={confirmation}
              onChange={e => setConfirmation(e.target.value)}
              autoComplete="off"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              {t('actions.cancel')}
            </Button>
            <Button type="submit" disabled={isPending || !confirmationMatches}>
              {isPending ? t('actions.sending') : t('actions.confirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
