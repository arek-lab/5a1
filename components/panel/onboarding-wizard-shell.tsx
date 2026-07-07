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
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <div className="h-2 w-full rounded bg-gray-200">
          <div
            className="h-2 rounded bg-blue-600"
            style={{ width: `${readinessPercentage}%` }}
          />
        </div>
        <p className="mt-1 text-sm text-gray-600">
          {t('readiness.label', { percent: readinessPercentage })}
        </p>
      </div>
      <nav className="flex flex-wrap gap-2 border-b pb-4">
        {steps.map(step => (
          <button
            key={step.key}
            type="button"
            disabled={!step.interactive}
            aria-current={step.key === activeStepKey ? 'step' : undefined}
            onClick={() => goToStep(step)}
            className={
              step.key === activeStepKey
                ? 'rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white'
                : step.interactive
                  ? 'rounded border px-3 py-1.5 text-sm font-medium hover:bg-gray-100'
                  : 'rounded border px-3 py-1.5 text-sm font-medium text-gray-400 disabled:cursor-not-allowed'
            }
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
