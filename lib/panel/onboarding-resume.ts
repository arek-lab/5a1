import type { OnboardingStepKey } from '@/lib/panel/onboarding-steps'

export function resumeStepKey(profileComplete: boolean): OnboardingStepKey {
  if (!profileComplete) return 'profile'
  return 'services'
}
