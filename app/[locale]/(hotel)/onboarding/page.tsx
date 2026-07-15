import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createServerClient } from '@/lib/supabase/server'
import { getHotelUser } from '@/lib/panel/auth'
import { canPerform } from '@/lib/panel/rbac'
import { isProfileComplete, getReadiness } from '@/lib/panel/readiness'
import { resumeStepKey } from '@/lib/panel/onboarding-resume'
import { ONBOARDING_STEPS, type OnboardingStepKey } from '@/lib/panel/onboarding-steps'
import OnboardingWizardShell from '@/components/panel/onboarding-wizard-shell'
import RequirePermission from '@/components/panel/require-permission'
import ProfileStepForm from './profile-step-form'
import ProfileReadonly from './profile-readonly'
import ServicesStep from './services-step'
import KnowledgeStep from './knowledge-step'

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
  const canWriteServices = canPerform(hotelUser.role, 'services', 'write')
  const canWriteKnowledge = canPerform(hotelUser.role, 'knowledge', 'write')
  const t = await getTranslations('onboarding.wizard')

  let activeServices: { id: string; name: string }[] = []
  if (activeStepKey === 'services') {
    const { data } = await supabase
      .from('services')
      .select('id, name')
      .eq('property_id', hotelUser.propertyId)
      .eq('is_active', true)
      .order('name')
    activeServices = data ?? []
  }

  let faqEntries: { id: string; question: string | null }[] = []
  if (activeStepKey === 'knowledge') {
    const { data } = await supabase
      .from('knowledge_chunks')
      .select('id, question')
      .eq('property_id', hotelUser.propertyId)
      .eq('category', 'faq')
      .order('created_at')
    faqEntries = data ?? []
  }

  return (
    <RequirePermission role={hotelUser.role} resource="hotel_profile" level="read">
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
        ) : activeStepKey === 'services' ? (
          <ServicesStep activeServices={activeServices} canEdit={canWriteServices} />
        ) : activeStepKey === 'knowledge' ? (
          <KnowledgeStep faqEntries={faqEntries} canEdit={canWriteKnowledge} />
        ) : (
          <p className="italic text-panel-ink-muted">{t('comingSoon')}</p>
        )}
      </OnboardingWizardShell>
    </RequirePermission>
  )
}
