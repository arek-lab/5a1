'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import type { HotelRole } from '@/lib/panel/rbac'
import { changeRole, resendInvite, deactivateUser, reactivateUser } from './actions'
import InviteForm from './invite-form'
import TransferOwnershipModal from './transfer-ownership-modal'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

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
  canTransferOwnership: boolean
}

const ASSIGNABLE_ROLES: HotelRole[] = ['admin', 'staff', 'viewer']
const actionButtonClass = 'h-6 px-2 text-[11px]'

function statusBadgeVariant(status: string): 'default' | 'secondary' | 'outline' {
  switch (status) {
    case 'active':
      return 'default'
    case 'invited':
      return 'outline'
    default:
      return 'secondary'
  }
}

export default function UserList({ users, canEdit, currentUserId, canTransferOwnership }: Props) {
  const t = useTranslations('users')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [inviting, setInviting] = useState(false)

  const transferCandidates = users
    .filter(u => u.status === 'active' && u.id !== currentUserId)
    .map(u => ({ id: u.id, email: u.email }))

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

  function handleDeactivate(userId: string) {
    setError(null)
    startTransition(async () => {
      const result = await deactivateUser(userId)
      if (result.error) setError(result.error)
    })
  }

  function handleReactivate(userId: string) {
    setError(null)
    startTransition(async () => {
      const result = await reactivateUser(userId)
      if (result.error) setError(result.error)
    })
  }

  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(`list.errors.${error}`)}
        </p>
      )}

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={inviting ? 'default' : 'outline'}
            size="sm"
            onClick={() => setInviting(v => !v)}
          >
            {t('invite.toggle')}
          </Button>
          {canTransferOwnership && <TransferOwnershipModal candidates={transferCandidates} />}
        </div>
      )}

      {canEdit && inviting && (
        <div className="rounded-md border border-border bg-panel-bg p-4">
          <InviteForm onSent={() => setInviting(false)} />
        </div>
      )}

      {users.length === 0 && (
        <p className="italic text-panel-ink-muted">{t('list.empty')}</p>
      )}

      {users.length > 0 && (
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead>{t('list.columns.user')}</TableHead>
              <TableHead className="w-44">{t('list.columns.lastLogin')}</TableHead>
              <TableHead className="w-32">{t('list.columns.role')}</TableHead>
              <TableHead className="w-56 text-right">{t('list.columns.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map(user => (
              <TableRow key={user.id} className="h-10">
                <TableCell>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{user.email}</span>
                    <Badge variant={statusBadgeVariant(user.status)}>
                      {t(`list.status.${user.status}`)}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="font-mono text-sm text-panel-ink-muted">
                  {user.last_login_at
                    ? new Date(user.last_login_at).toLocaleString()
                    : t('list.neverLoggedIn')}
                </TableCell>
                <TableCell>
                  {canEdit && user.role !== 'owner' ? (
                    <Select
                      value={user.role}
                      disabled={isPending}
                      onValueChange={value => handleChangeRole(user.id, value as HotelRole)}
                    >
                      <SelectTrigger size="sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ASSIGNABLE_ROLES.map(role => (
                          <SelectItem key={role} value={role}>
                            {t(`list.roles.${role}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-sm text-panel-ink-muted">{t(`list.roles.${user.role}`)}</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1.5">
                    {canEdit && user.status === 'invited' && (
                      <Button
                        type="button"
                        variant="outline"
                        className={actionButtonClass}
                        disabled={isPending}
                        onClick={() => handleResendInvite(user.id)}
                      >
                        {t('list.resendInvite')}
                      </Button>
                    )}
                    {canEdit && user.status === 'active' && user.id !== currentUserId && (
                      <Button
                        type="button"
                        variant="destructive"
                        className={actionButtonClass}
                        disabled={isPending}
                        onClick={() => handleDeactivate(user.id)}
                      >
                        {t('list.deactivate')}
                      </Button>
                    )}
                    {canEdit && user.status === 'deactivated' && (
                      <Button
                        type="button"
                        variant="outline"
                        className={actionButtonClass}
                        disabled={isPending}
                        onClick={() => handleReactivate(user.id)}
                      >
                        {t('list.reactivate')}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
