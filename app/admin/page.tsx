import { getPulseMetrics } from '@/lib/admin/pulse'
import { listPropertiesDpa } from '@/lib/admin/dpa'
import { markDpaSignedAction } from './actions'

export default async function AdminPulsePage() {
  const [metrics, properties] = await Promise.all([
    getPulseMetrics(),
    listPropertiesDpa(),
  ])

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

      <h2 className="mb-2 mt-8 text-xl font-semibold">DPA</h2>
      <p className="mb-3 text-sm text-panel-ink-muted">
        Oznaczaj dopiero po fizycznym podpisaniu DPA z hotelem. Operacja jest
        jednokierunkowa — cofnięcie wymaga ręcznego SQL.
      </p>
      <ul className="space-y-2 text-sm">
        {properties.map((property) => (
          <li key={property.id} className="flex items-center gap-3">
            <span className="min-w-48">{property.name}</span>
            {property.dpaSignedAt ? (
              <span className="font-mono text-panel-ink-muted">
                podpisane {property.dpaSignedAt.slice(0, 10)}
              </span>
            ) : (
              <form action={markDpaSignedAction}>
                <input type="hidden" name="propertyId" value={property.id} />
                <button
                  type="submit"
                  className="rounded border border-panel-ink-muted px-2 py-1 text-xs hover:bg-panel-ink/10"
                >
                  Oznacz DPA jako podpisane
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </main>
  )
}
