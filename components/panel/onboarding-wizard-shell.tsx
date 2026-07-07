'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { OnboardingStep, OnboardingStepKey } from '@/lib/panel/onboarding-steps'

interface Props {
  steps: OnboardingStep[]
  activeStepKey: OnboardingStepKey
  readinessPercentage: number
  children: React.ReactNode
}

export default function OnboardingWizardShell({
  steps,
  activeStepKey,
  readinessPercentage,
  children,
}: Props) {
  const t = useTranslations('onboarding')
  const router = useRouter()
  const pathname = usePathname()

  function goToStep(step: OnboardingStep) {
    if (!step.interactive) return
    router.push(`${pathname}?step=${step.key}`)
  }

  return (
    <div>
      <div className="h-2 w-full rounded bg-gray-200">
        <div
          className="h-2 rounded bg-blue-600"
          style={{ width: `${readinessPercentage}%` }}
        />
      </div>
      <p>{t('readiness.label', { percent: readinessPercentage })}</p>
      <nav>
        {steps.map(step => (
          <button
            key={step.key}
            type="button"
            disabled={!step.interactive}
            aria-current={step.key === activeStepKey ? 'step' : undefined}
            onClick={() => goToStep(step)}
          >
            {t(step.labelKey)}
            {!step.interactive && ` (${t('wizard.comingSoon')})`}
          </button>
        ))}
      </nav>
      {children}
    </div>
  )
}
