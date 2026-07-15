import { getTranslations } from 'next-intl/server'

export type Insight = {
  text: string
  timestamp: string
}

interface Props {
  insights: Insight[]
}

// TODO(S6.1 scope): source `insights` from an AI concierge conversation-log
// aggregation once that pipeline exists (style.md §2.4). No such aggregation
// exists yet as of this session, so this renders an empty state.
export async function InsightTicker({ insights }: Props) {
  const t = await getTranslations('panelNav')

  return (
    <section className="rounded-md border border-border bg-panel-surface p-4" aria-label="Insight ticker">
      <h2 className="mb-3 text-sm font-semibold text-panel-ink-muted">{t('insightTicker.title')}</h2>
      {insights.length === 0 ? (
        <p className="italic text-panel-ink-muted">{t('insightTicker.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {insights.map((insight, index) => (
            <li key={index} className="flex items-baseline gap-3 text-sm">
              <span className="shrink-0 font-mono text-xs text-panel-ink-muted">
                {new Date(insight.timestamp).toLocaleTimeString()}
              </span>
              <span>{insight.text}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
