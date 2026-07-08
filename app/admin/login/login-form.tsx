'use client'

import { useState, useTransition } from 'react'
import { login } from './actions'

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
    <main>
      <h1>Admin login</h1>
      <form action={handleSubmit}>
        {error && <p role="alert">{error}</p>}
        <label>
          Token
          <input type="password" name="token" required />
        </label>
        <button type="submit" disabled={isPending}>
          {isPending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}
