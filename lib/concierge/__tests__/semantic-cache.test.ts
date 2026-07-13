import { describe, it, expect } from 'vitest'
import { lookupCachedAnswer, storeCachedAnswer } from '../semantic-cache'

describe('semantic-cache stub', () => {
  it('lookupCachedAnswer always resolves null (cache miss)', async () => {
    await expect(lookupCachedAnswer('prop-1', 'any question')).resolves.toBeNull()
  })

  it('storeCachedAnswer resolves without throwing (no-op)', async () => {
    await expect(storeCachedAnswer('prop-1', 'q', 'a')).resolves.toBeUndefined()
  })
})
