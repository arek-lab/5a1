import { describe, it, expect } from 'vitest'
import { validateKnowledgeInput } from '../knowledge-validation'

const validFaqInput = {
  question: 'Jakie są godziny check-in?',
  content: 'Check-in od 14:00, check-out do 11:00.',
  category: 'faq',
  language: 'pl',
  validFromRaw: '',
  validUntilRaw: '',
}

describe('validateKnowledgeInput', () => {
  it('accepts a valid faq input', () => {
    const result = validateKnowledgeInput(validFaqInput)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.question).toBe(validFaqInput.question)
      expect(result.value.content).toBe(validFaqInput.content)
      expect(result.value.category).toBe('faq')
      expect(result.value.language).toBe('pl')
      expect(result.value.validFrom).toBeNull()
      expect(result.value.validUntil).toBeNull()
    }
  })

  it('requires a question for faq category', () => {
    const result = validateKnowledgeInput({ ...validFaqInput, question: '  ' })
    expect(result).toEqual({ ok: false, error: 'questionRequired' })
  })

  it('ignores question for local category', () => {
    const result = validateKnowledgeInput({ ...validFaqInput, category: 'local', question: '' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.question).toBeNull()
    }
  })

  it('rejects a category outside the closed list', () => {
    const result = validateKnowledgeInput({ ...validFaqInput, category: 'restaurant' })
    expect(result).toEqual({ ok: false, error: 'invalidCategory' })
  })

  it('rejects a language outside the closed list', () => {
    const result = validateKnowledgeInput({ ...validFaqInput, language: 'de' })
    expect(result).toEqual({ ok: false, error: 'invalidLanguage' })
  })

  it('requires content', () => {
    const result = validateKnowledgeInput({ ...validFaqInput, content: '   ' })
    expect(result).toEqual({ ok: false, error: 'contentRequired' })
  })

  it('accepts a valid date range', () => {
    const result = validateKnowledgeInput({
      ...validFaqInput,
      validFromRaw: '2026-01-01',
      validUntilRaw: '2026-12-31',
    })
    expect(result.ok).toBe(true)
  })

  it('rejects validFrom after validUntil', () => {
    const result = validateKnowledgeInput({
      ...validFaqInput,
      validFromRaw: '2026-12-31',
      validUntilRaw: '2026-01-01',
    })
    expect(result).toEqual({ ok: false, error: 'invalidDateRange' })
  })

  it('rejects an unparseable date', () => {
    const result = validateKnowledgeInput({ ...validFaqInput, validFromRaw: 'not-a-date' })
    expect(result).toEqual({ ok: false, error: 'invalidDateRange' })
  })
})
