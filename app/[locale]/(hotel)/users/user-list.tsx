'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import type { HotelRole } from '@/lib/panel/rbac'
import { changeRole, resendInvite } from './actions'
import InviteForm from './invite-form'

export type HotelUserRecord = {
  id: string
  email: string
  full_name: string | null
  role: HotelRole
  status: string
  invite_expires_at: string | null
  last_login_at: string | null
}

interface Props {
  users: HotelUserRecord[]
  canEdit: boolean
  currentUserId: string
}

const ASSIGNABLE_ROLES: HotelRole[] = ['admin', 'staff', 'viewer']

function statusBadgeClass(status: string) {
  switch (status) {
    case 'active':
      return 'rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800'
    case 'invited':
      return 'rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800'
    case 'deactivated':
      return 'rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600'
    default:
      return 'rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600'
  }
}

export default function UserList({ users, canEdit }: Props) {
  const t = useTranslations('users')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [inviting, setInviting] = useState(false)

  function handleChangeRole(userId: string, newRole: HotelRole) {
    setError(null)
    startTransition(async () => {
      const result = await changeRole(userId, newRole)
      if (result.error) setError(result.error)
    })
  }

  function handleResendInvite(userId: string) {
    setError(null)
    startTransition(async () => {
      const result = await resendInvite(userId)
      if (result.error) setError(result.error)
    })
  }

  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {t(`list.errors.${error}`)}
        </p>
      )}

      {canEdit && (
        <div>
          <button
            type="button"
            className={`rounded border px-3 py-1.5 text-sm font-medium hover:bg-gray-100 hover:text-gray-900 ${inviting ? 'bg-blue-600 text-white hover:bg-blue-700' : ''}`}
            onClick={() => setInviting(v => !v)}
          >
            {t('invite.toggle')}
          </button>
        </div>
      )}

      {canEdit && inviting && (
        <div className="rounded border bg-gray-50 p-4 text-gray-900">
          <InviteForm onSent={() => setInviting(false)} />
        </div>
      )}

      {users.length === 0 && (
        <p className="italic text-gray-500">{t('list.empty')}</p>
      )}

      {users.length > 0 && (
        <ul className="divide-y rounded border">
          {users.map(user => (
            <li key={user.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{user.email}</span>
                <span className={statusBadgeClass(user.status)}>
                  {t(`list.status.${user.status}`)}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600">
                  {user.last_login_at
                    ? new Date(user.last_login_at).toLocaleString()
                    : t('list.neverLoggedIn')}
                </span>
                {canEdit && user.role !== 'owner' ? (
                  <select
                    className="rounded border px-2 py-1 text-sm disabled:opacity-50"
                    value={user.role}
                    disabled={isPending}
                    onChange={e => handleChangeRole(user.id, e.target.value as HotelRole)}
                  >
                    {ASSIGNABLE_ROLES.map(role => (
                      <option key={role} value={role}>
                        {t(`list.roles.${role}`)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-sm text-gray-600">{t(`list.roles.${user.role}`)}</span>
                )}
                {canEdit && user.status === 'invited' && (
                  <button
                    type="button"
                    className="rounded border px-2 py-1 text-sm hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50"
                    disabled={isPending}
                    onClick={() => handleResendInvite(user.id)}
                  >
                    {t('list.resendInvite')}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
