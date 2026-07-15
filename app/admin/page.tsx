import { getPulseMetrics } from '@/lib/admin/pulse'

export default async function AdminPulsePage() {
  const metrics = await getPulseMetrics()

  return (
    <main data-theme="panel" className="min-h-screen bg-panel-bg p-6 font-ui text-panel-ink">
      <h1 className="mb-4 text-2xl font-semibold">Pulse</h1>
      <ul className="space-y-1 text-sm">
        <li>Guests online: <span className="font-mono">{metrics.guestsOnline}</span></li>
        <li>Orders (24h): <span className="font-mono">{metrics.orders24h}</span></li>
        <li>QR scans (24h): <span className="font-mono">{metrics.qrScans24h}</span></li>
        <li>Operators active (7d): <span className="font-mono">{metrics.operators7d}</span></li>
        <li className="text-panel-ink-muted">Escalation rate: not available (requires AI Concierge — Phase 4)</li>
      </ul>
    </main>
  )
}
