import { describe, it, expect } from 'vitest'
import { computeContentHash } from '../knowledge-hash'

describe('computeContentHash', () => {
  it('returns a deterministic 64-char hex string', () => {
    const hash = computeContentHash('Check-in od 14:00.')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(computeContentHash('Check-in od 14:00.')).toBe(hash)
  })

  it('returns different hashes for different content', () => {
    const hashA = computeContentHash('Content A')
    const hashB = computeContentHash('Content B')
    expect(hashA).not.toBe(hashB)
  })
})
