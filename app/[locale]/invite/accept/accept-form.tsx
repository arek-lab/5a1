'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function AcceptForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const propertyId = searchParams.get('property_id')
    if (!propertyId) {
      setError('missing_property')
      setLoading(false)
      return
    }

    const supabase = createBrowserClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }

    const response = await fetch('/api/invite/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propertyId }),
    })
    if (!response.ok) {
      setError('activation_failed')
      setLoading(false)
      return
    }

    router.push('/dashboard')
  }

  return (
    <main data-theme="panel" className="flex min-h-screen items-center justify-center bg-panel-bg font-ui text-panel-ink">
      <div className="w-full max-w-sm rounded-lg border border-border bg-panel-surface p-6">
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="space-y-1">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Activating…' : 'Activate account'}
          </Button>
        </form>
      </div>
    </main>
  )
}
