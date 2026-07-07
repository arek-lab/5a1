export type OnboardingStepKey = 'profile' | 'services' | 'knowledge'

export type OnboardingStep = {
  key: OnboardingStepKey
  labelKey: string
  interactive: boolean
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  { key: 'profile', labelKey: 'steps.profile', interactive: true },
  { key: 'services', labelKey: 'steps.services', interactive: true },
  { key: 'knowledge', labelKey: 'steps.knowledge', interactive: true },
]
