export default function ExpiredInvite() {
  return (
    <main data-theme="panel" className="flex min-h-screen items-center justify-center bg-panel-bg font-ui text-panel-ink">
      <div className="w-full max-w-sm space-y-2 rounded-lg border border-border bg-panel-surface p-6 text-center">
        <h1 className="text-xl font-semibold">This invitation has expired</h1>
        <p className="text-sm text-panel-ink-muted">
          Ask an Owner or Admin to resend your invite from the users list.
        </p>
      </div>
    </main>
  )
}
