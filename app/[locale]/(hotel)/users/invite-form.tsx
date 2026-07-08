'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import type { HotelRole } from '@/lib/panel/rbac'
import { inviteUser } from './actions'

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

  const inputClass = 'w-full rounded border px-2 py-1'
  const labelClass = 'flex flex-col gap-1 text-sm font-medium'

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {t(`errors.${error}`)}
        </p>
      )}
      <label className={labelClass}>
        {t('fields.email')}
        <input
          className={inputClass}
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
      </label>
      <label className={labelClass}>
        {t('fields.role')}
        <select className={inputClass} value={role} onChange={e => setRole(e.target.value as HotelRole)}>
          {INVITABLE_ROLES.map(r => (
            <option key={r} value={r}>{tRoles(r)}</option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {isPending ? t('actions.sending') : t('actions.send')}
      </button>
    </form>
  )
}
