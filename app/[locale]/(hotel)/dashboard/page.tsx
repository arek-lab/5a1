import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createServerClient } from '@/lib/supabase/server'
import { getHotelUser } from '@/lib/panel/auth'
import { canPerform } from '@/lib/panel/rbac'
import { getReadiness } from '@/lib/panel/readiness'

export default async function HotelDashboardPage() {
  const hotelUser = await getHotelUser()
  if (!hotelUser) redirect('/login')

  const canManageSetup = canPerform(hotelUser.role, 'hotel_profile', 'write')

  let showBanner = false
  let readinessPercentage = 0

  if (canManageSetup) {
    const supabase = await createServerClient()
    const { data: property } = await supabase
      .from('properties')
      .select('setup_completed')
      .eq('id', hotelUser.propertyId)
      .single()

    if (property && !property.setup_completed) {
      const readiness = await getReadiness(hotelUser.propertyId)
      showBanner = true
      readinessPercentage = readiness.percentage
    }
  }

  const t = await getTranslations('onboarding')

  return (
    <main>
      <h1>Hotel Dashboard</h1>
      {showBanner && (
        <p>
          {t('banner.cta')} — {t('readiness.label', { percent: readinessPercentage })}{' '}
          <Link href="/onboarding">{t('banner.cta')}</Link>
        </p>
      )}
    </main>
  )
}
