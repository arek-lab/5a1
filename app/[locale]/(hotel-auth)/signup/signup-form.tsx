'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createBrowserClient } from '@/lib/supabase/client'
import { createHotelAndOwner } from './actions'

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
    <form onSubmit={handleSubmit}>
      {error && (
        <p role="alert">
          {['email_taken', 'invalid_hotel_name', 'rate_limited', 'invalid_request', 'signup_failed'].includes(error)
            ? t(`errors.${error}`)
            : error}
        </p>
      )}
      <label>
        {t('fields.email')}
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
      </label>
      <label>
        {t('fields.password')}
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          minLength={8}
          required
        />
      </label>
      <label>
        {t('fields.hotelName')}
        <input
          value={hotelName}
          onChange={e => setHotelName(e.target.value)}
          required
        />
      </label>
      <button type="submit" disabled={loading}>
        {loading ? t('actions.signingUp') : t('actions.signUp')}
      </button>
    </form>
  )
}
