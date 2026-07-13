import { describe, it, expect } from 'vitest'
import { buildSystemPrompt } from '../system-prompt'

describe('buildSystemPrompt', () => {
  it('includes the [FALLBACK] instruction', () => {
    expect(buildSystemPrompt()).toContain('[FALLBACK]')
  })

  it('includes the mandatory virtual-assistant disclosure phrase', () => {
    expect(buildSystemPrompt()).toContain('wirtualnym asystentem')
  })

  it('never claims to book/modify reservations or place orders', () => {
    const prompt = buildSystemPrompt()
    expect(prompt).toMatch(/nigdy nie twierdzisz/i)
  })

  it('interpolates a custom bot name', () => {
    expect(buildSystemPrompt('Hopper')).toContain('Jesteś Hopper')
  })

  it('falls back to a default name when none is given', () => {
    expect(buildSystemPrompt()).toContain('Jesteś Asystent')
  })
})
