import { getPulseMetrics } from '@/lib/admin/pulse'

export default async function AdminPulsePage() {
  const metrics = await getPulseMetrics()

  return (
    <main>
      <h1>Pulse</h1>
      <ul>
        <li>Guests online: {metrics.guestsOnline}</li>
        <li>Orders (24h): {metrics.orders24h}</li>
        <li>QR scans (24h): {metrics.qrScans24h}</li>
        <li>Operators active (7d): {metrics.operators7d}</li>
        <li>Escalation rate: not available (requires AI Concierge — Phase 4)</li>
      </ul>
    </main>
  )
}
