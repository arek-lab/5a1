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
  rate_limited: 'rateLimited',
  signed_out: 'signedOut',
  generic: 'generic',
}

export default async function ErrorPage({ searchParams }: Props) {
  const { type, property_id: propertyId } = await searchParams
  const group = GROUP_KEY[resolveErrorGroup(type)]
  const branding = await getErrorPageBranding(propertyId)
  const t = await getTranslations('guest.error')

  return (
    <main
      data-theme="guest"
      className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-4 py-6 text-center font-ui text-guest-ink"
    >
      {branding?.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={branding.logoUrl} alt={branding.name} className="h-10 max-w-[160px] object-contain" />
      )}
      {branding && !branding.logoUrl && (
        <span className="font-display text-lg font-semibold text-guest-ink">{branding.name}</span>
      )}
      <h1 className="font-display text-2xl font-semibold text-guest-ink">{t(`${group}.heading`)}</h1>
      <p className="text-guest-ink-muted">{t(`${group}.body`)}</p>
      {branding?.phoneReception && (
        <p className="text-guest-ink-muted">
          {t('contactReception')}{' '}
          <a href={`tel:${branding.phoneReception}`} className="font-semibold underline">
            {branding.phoneReception}
          </a>
        </p>
      )}
      <Link
        href="/"
        className="mt-4 rounded-pill border border-guest-ink-muted/30 px-6 py-3 text-base font-semibold text-guest-ink hover:bg-guest-paper"
      >
        {t('backHome')}
      </Link>
    </main>
  )
}
