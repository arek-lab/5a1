'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import type { HotelRole } from '@/lib/panel/rbac'
import { inviteUser } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Props {
  onSent?: () => void
}

const INVITABLE_ROLES: HotelRole[] = ['admin', 'staff', 'viewer']

export default function InviteForm({ onSent }: Props) {
  const t = useTranslations('users.invite')
  const tRoles = useTranslations('users.list.roles')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<HotelRole>('staff')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const formData = new FormData()
    formData.set('email', email)
    formData.set('role', role)

    startTransition(async () => {
      const result = await inviteUser(formData)
      if (result.error) {
        setError(result.error)
      } else {
        setEmail('')
        onSent?.()
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
        <Label htmlFor="invite-email">{t('fields.email')}</Label>
        <Input
          id="invite-email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="invite-role">{t('fields.role')}</Label>
        <Select value={role} onValueChange={value => setRole(value as HotelRole)}>
          <SelectTrigger id="invite-role" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {INVITABLE_ROLES.map(r => (
              <SelectItem key={r} value={r}>{tRoles(r)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? t('actions.sending') : t('actions.send')}
      </Button>
    </form>
  )
}
