import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function UnauthorizedPage() {
  return (
    <main data-theme="panel" className="flex min-h-screen items-center justify-center bg-panel-bg font-ui text-panel-ink">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-panel-surface p-6 text-center">
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p className="text-sm text-panel-ink-muted">You do not have the required role to view this page.</p>
        <Button asChild className="w-full">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </main>
  )
}
