import { describe, it, expect } from 'vitest'
import { validateServiceInput, wouldExceedPinLimit } from '../service-validation'

const validInput = {
  name: 'Masaż',
  category: 'spa',
  priceCentsRaw: '15000',
  imageUrl: '',
  isTimeSensitive: false,
}

describe('validateServiceInput', () => {
  it('accepts a valid input', () => {
    const result = validateServiceInput(validInput)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual({
        name: 'Masaż',
        category: 'spa',
        priceCents: 15000,
        imageUrl: null,
        isTimeSensitive: false,
      })
    }
  })

  it('passes isTimeSensitive through unchanged regardless of value', () => {
    const result = validateServiceInput({ ...validInput, isTimeSensitive: true })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.isTimeSensitive).toBe(true)
    }
  })

  it('rejects an empty name', () => {
    const result = validateServiceInput({ ...validInput, name: '  ' })
    expect(result).toEqual({ ok: false, error: 'nameRequired' })
  })

  it('rejects a category outside the closed list', () => {
    const result = validateServiceInput({ ...validInput, category: 'food' })
    expect(result).toEqual({ ok: false, error: 'invalidCategory' })
  })

  it('treats an empty price as "Included" (null)', () => {
    const result = validateServiceInput({ ...validInput, priceCentsRaw: '' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.priceCents).toBeNull()
    }
  })

  it('rejects a negative price', () => {
    const result = validateServiceInput({ ...validInput, priceCentsRaw: '-100' })
    expect(result).toEqual({ ok: false, error: 'invalidPrice' })
  })

  it('rejects a non-integer price', () => {
    const result = validateServiceInput({ ...validInput, priceCentsRaw: '10.5' })
    expect(result).toEqual({ ok: false, error: 'invalidPrice' })
  })

  it('rejects an invalid image URL', () => {
    const result = validateServiceInput({ ...validInput, imageUrl: 'not-a-url' })
    expect(result).toEqual({ ok: false, error: 'invalidUrl' })
  })

  it('accepts a valid image URL', () => {
    const result = validateServiceInput({ ...validInput, imageUrl: 'https://example.com/img.jpg' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.imageUrl).toBe('https://example.com/img.jpg')
    }
  })
})

describe('wouldExceedPinLimit', () => {
  it('allows pinning up to 3 services', () => {
    expect(wouldExceedPinLimit(0)).toBe(false)
    expect(wouldExceedPinLimit(1)).toBe(false)
    expect(wouldExceedPinLimit(2)).toBe(false)
  })

  it('rejects pinning a 4th service', () => {
    expect(wouldExceedPinLimit(3)).toBe(true)
  })

  it('allows re-saving an already-pinned service without changing the count', () => {
    // "other pinned" count excludes the current service, so editing it while
    // already pinned (2 others pinned) must stay under the limit.
    expect(wouldExceedPinLimit(2)).toBe(false)
  })
})
