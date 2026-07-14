import { getTranslations } from 'next-intl/server'
import Link from 'next/link'

export default async function OfflinePage() {
  const t = await getTranslations('guest.offline')

  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-4 py-6 text-center">
      <h1 className="text-2xl font-semibold text-gray-900">{t('heading')}</h1>
      <p className="text-gray-700">{t('body')}</p>
      <Link
        href="/"
        className="mt-4 rounded-full border px-6 py-3 text-base font-semibold text-gray-700 hover:bg-gray-50"
      >
        {t('retry')}
      </Link>
    </main>
  )
}
