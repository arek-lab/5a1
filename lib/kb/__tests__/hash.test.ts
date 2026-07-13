import { describe, it, expect } from 'vitest'
import { computeCompositeHash } from '../hash'
import type { KbSections } from '../types'

function emptySections(): KbSections {
  return { faq: [], services: [], restaurant: [], policies: [], local: [] }
}

describe('computeCompositeHash', () => {
  it('returns a deterministic 64-char hex string for the same input', () => {
    const sections: KbSections = {
      ...emptySections(),
      faq: [{ question: 'Q1', content: 'A1', hash: 'hash-1' }],
    }

    const hash = computeCompositeHash(sections)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(computeCompositeHash(sections)).toBe(hash)
  })

  it('changes when any single row hash changes', () => {
    const base: KbSections = {
      ...emptySections(),
      faq: [{ question: 'Q1', content: 'A1', hash: 'hash-1' }],
    }
    const changed: KbSections = {
      ...emptySections(),
      faq: [{ question: 'Q1', content: 'A1 edited', hash: 'hash-1-edited' }],
    }

    expect(computeCompositeHash(changed)).not.toBe(computeCompositeHash(base))
  })

  it('does not crash on all-empty sections and is stable', () => {
    const sections = emptySections()
    const hash = computeCompositeHash(sections)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(computeCompositeHash(emptySections())).toBe(hash)
  })

  it('is sensitive to row order within a section', () => {
    const forward: KbSections = {
      ...emptySections(),
      local: [
        { question: null, content: 'A', hash: 'hash-a' },
        { question: null, content: 'B', hash: 'hash-b' },
      ],
    }
    const reversed: KbSections = {
      ...emptySections(),
      local: [
        { question: null, content: 'B', hash: 'hash-b' },
        { question: null, content: 'A', hash: 'hash-a' },
      ],
    }

    expect(computeCompositeHash(forward)).not.toBe(computeCompositeHash(reversed))
  })
})
