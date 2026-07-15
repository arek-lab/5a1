'use client'

import { useState, useTransition } from 'react'
import { login } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function LoginForm() {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await login(formData)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <main data-theme="panel" className="flex min-h-screen items-center justify-center bg-panel-bg font-ui text-panel-ink">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-panel-surface p-6">
        <h1 className="text-xl font-semibold">Admin login</h1>
        <form action={handleSubmit} className="space-y-3">
          {error && (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="space-y-1">
            <Label htmlFor="token">Token</Label>
            <Input id="token" type="password" name="token" required />
          </div>
          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>
    </main>
  )
}
