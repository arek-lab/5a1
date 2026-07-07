import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createServerClient } from '@/lib/supabase/server'
import { getHotelUser } from '@/lib/panel/auth'
import { canPerform } from '@/lib/panel/rbac'
import { isProfileComplete, getReadiness } from '@/lib/panel/readiness'
import { resumeStepKey } from '@/lib/panel/onboarding-resume'
import { ONBOARDING_STEPS, type OnboardingStepKey } from '@/lib/panel/onboarding-steps'
import OnboardingWizardShell from '@/components/panel/onboarding-wizard-shell'
import ProfileStepForm from './profile-step-form'
import ProfileReadonly from './profile-readonly'

const STEP_KEYS = ONBOARDING_STEPS.map(s => s.key)

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>
}) {
  const hotelUser = await getHotelUser()
  if (!hotelUser) redirect('/login')

  const supabase = await createServerClient()
  const { data: property } = await supabase
    .from('properties')
    .select('name, address, phone_reception, timezone, check_in_time, check_out_time, logo_url')
    .eq('id', hotelUser.propertyId)
    .single()

  if (!property) redirect('/dashboard')

  const profileComplete = isProfileComplete(property)
  const resumedStep = resumeStepKey(profileComplete)
  const readiness = await getReadiness(hotelUser.propertyId)

  const { step } = await searchParams
  const activeStepKey: OnboardingStepKey = STEP_KEYS.includes(step as OnboardingStepKey)
    ? (step as OnboardingStepKey)
    : resumedStep

  const canWrite = canPerform(hotelUser.role, 'hotel_profile', 'write')
  const t = await getTranslations('onboarding.wizard')

  return (
    <OnboardingWizardShell
      steps={ONBOARDING_STEPS}
      activeStepKey={activeStepKey}
      readinessPercentage={readiness.percentage}
    >
      {activeStepKey === 'profile' ? (
        canWrite ? (
          <ProfileStepForm initialValues={property} />
        ) : (
          <ProfileReadonly initialValues={property} />
        )
      ) : (
        <p>{t('comingSoon')}</p>
      )}
    </OnboardingWizardShell>
  )
}
