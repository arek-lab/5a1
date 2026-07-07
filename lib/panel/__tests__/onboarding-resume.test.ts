import { describe, it, expect } from 'vitest'
import { resumeStepKey } from '../onboarding-resume'

describe('resumeStepKey', () => {
  it('returns profile when profile is not complete', () => {
    expect(resumeStepKey(false)).toBe('profile')
  })

  it('returns services when profile is complete', () => {
    expect(resumeStepKey(true)).toBe('services')
  })
})
