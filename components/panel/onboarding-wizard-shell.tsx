'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { OnboardingStep, OnboardingStepKey } from '@/lib/panel/onboarding-steps'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

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
    <div data-theme="panel" className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <Progress value={readinessPercentage} />
        <p className="mt-1 text-sm text-muted-foreground">
          {t('readiness.label', { percent: readinessPercentage })}
        </p>
      </div>
      <nav className="flex flex-wrap gap-2 border-b pb-4">
        {steps.map(step => (
          <Button
            key={step.key}
            type="button"
            size="sm"
            disabled={!step.interactive}
            aria-current={step.key === activeStepKey ? 'step' : undefined}
            onClick={() => goToStep(step)}
            variant={step.key === activeStepKey ? 'default' : 'outline'}
          >
            {t(step.labelKey)}
            {!step.interactive && ` (${t('wizard.comingSoon')})`}
          </Button>
        ))}
      </nav>
      {children}
    </div>
  )
}
