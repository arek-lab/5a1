import Link from 'next/link'

export default function UnauthorizedPage() {
  return (
    <main>
      <h1>Access denied</h1>
      <p>You do not have the required role to view this page.</p>
      <Link href="/dashboard">Back to dashboard</Link>
    </main>
  )
}
