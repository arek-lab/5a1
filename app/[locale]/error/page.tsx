import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { resolveErrorGroup, getErrorPageBranding } from '@/lib/guest/error-copy'

interface Props {
  searchParams: Promise<{ type?: string; property_id?: string }>
}

const GROUP_KEY: Record<ReturnType<typeof resolveErrorGroup>, string> = {
  expired: 'expired',
  invalid: 'invalid',
  insufficient_access: 'insufficientAccess',
  generic: 'generic',
}

export default async function ErrorPage({ searchParams }: Props) {
  const { type, property_id: propertyId } = await searchParams
  const group = GROUP_KEY[resolveErrorGroup(type)]
  const branding = await getErrorPageBranding(propertyId)
  const t = await getTranslations('guest.error')

  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-4 py-6 text-center">
      {branding?.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={branding.logoUrl} alt={branding.name} className="h-10 max-w-[160px] object-contain" />
      )}
      {branding && !branding.logoUrl && (
        <span className="text-lg font-semibold text-gray-900">{branding.name}</span>
      )}
      <h1 className="text-2xl font-semibold text-gray-900">{t(`${group}.heading`)}</h1>
      <p className="text-gray-700">{t(`${group}.body`)}</p>
      {branding?.phoneReception && (
        <p className="text-gray-700">
          {t('contactReception')}{' '}
          <a href={`tel:${branding.phoneReception}`} className="font-semibold underline">
            {branding.phoneReception}
          </a>
        </p>
      )}
      <Link
        href="/"
        className="mt-4 rounded-full border px-6 py-3 text-base font-semibold text-gray-700 hover:bg-gray-50"
      >
        {t('backHome')}
      </Link>
    </main>
  )
}
