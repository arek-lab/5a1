'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@/lib/supabase/client'
import AcceptForm from './accept-form'
import ExpiredInvite from './expired-invite'

export default function AcceptGate() {
  const [status, setStatus] = useState<'checking' | 'ready' | 'expired'>('checking')

  useEffect(() => {
    let cancelled = false
    // Invite links use the implicit flow — tokens arrive in the URL hash, which
    // never reaches the server. detectSessionInUrl (default on) resolves them
    // here, on first client-side init, before getSession() returns.
    createBrowserClient()
      .auth.getSession()
      .then(({ data: { session } }) => {
        if (!cancelled) setStatus(session ? 'ready' : 'expired')
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (status === 'checking') return null
  if (status === 'expired') return <ExpiredInvite />
  return <AcceptForm />
}
