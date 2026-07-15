'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createBrowserClient } from '@/lib/supabase/client'
import { createHotelAndOwner } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function SignupForm() {
  const router = useRouter()
  const t = useTranslations('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [hotelName, setHotelName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createBrowserClient()
    const { data, error: signUpError } = await supabase.auth.signUp({ email, password })
    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }
    if (!data.user) {
      setError('signup_failed')
      setLoading(false)
      return
    }

    const formData = new FormData()
    formData.set('authUserId', data.user.id)
    formData.set('email', email)
    formData.set('hotelName', hotelName)

    const result = await createHotelAndOwner(formData)
    if (!result.ok) {
      setError(result.error)
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
              {['email_taken', 'invalid_hotel_name', 'rate_limited', 'invalid_request', 'signup_failed'].includes(error)
                ? t(`errors.${error}`)
                : error}
            </p>
          )}
          <div className="space-y-1">
            <Label htmlFor="signup-email">{t('fields.email')}</Label>
            <Input
              id="signup-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="signup-password">{t('fields.password')}</Label>
            <Input
              id="signup-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="signup-hotel-name">{t('fields.hotelName')}</Label>
            <Input
              id="signup-hotel-name"
              value={hotelName}
              onChange={e => setHotelName(e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? t('actions.signingUp') : t('actions.signUp')}
          </Button>
        </form>
      </div>
    </main>
  )
}
