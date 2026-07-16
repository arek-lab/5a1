import { getTranslations } from 'next-intl/server'
import Link from 'next/link'

export default async function OfflinePage() {
  const t = await getTranslations('guest.offline')

  return (
    <main
      data-theme="guest"
      className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-4 py-6 text-center font-ui text-guest-ink"
    >
      <h1 className="font-display text-2xl font-semibold text-guest-ink">{t('heading')}</h1>
      <p className="text-guest-ink-muted">{t('body')}</p>
      <Link
        href="/"
        className="mt-4 rounded-pill border border-guest-ink-muted/30 px-6 py-3 text-base font-semibold text-guest-ink hover:bg-guest-paper"
      >
        {t('retry')}
      </Link>
    </main>
  )
}
