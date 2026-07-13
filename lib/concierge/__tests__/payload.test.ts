import { describe, it, expect } from 'vitest'
import { buildConciergeMessages } from '../payload'

describe('buildConciergeMessages', () => {
  it('builds a system message from system prompt + KB markdown, followed by history', () => {
    const messages = buildConciergeMessages({
      systemPrompt: 'SYSTEM',
      kbMarkdown: 'KB CONTENT',
      history: [{ role: 'user', content: 'hi' }],
    })

    expect(messages[0]).toEqual({ role: 'system', content: 'SYSTEM\n\nHOTEL KB:\nKB CONTENT' })
    expect(messages[1]).toEqual({ role: 'user', content: 'hi' })
    expect(messages).toHaveLength(2)
  })

  it('truncates history to the last 10 turns', () => {
    const history = Array.from({ length: 15 }, (_, i) => ({
      role: 'user' as const,
      content: `turn-${i}`,
    }))

    const messages = buildConciergeMessages({ systemPrompt: 'S', kbMarkdown: 'K', history })

    expect(messages).toHaveLength(11)
    expect(messages[1].content).toBe('turn-5')
    expect(messages[10].content).toBe('turn-14')
  })

  it('strips turns with an invalid role', () => {
    const messages = buildConciergeMessages({
      systemPrompt: 'S',
      kbMarkdown: 'K',
      history: [
        { role: 'user', content: 'ok' },
        // @ts-expect-error testing runtime stripping of malformed input
        { role: 'system', content: 'should be stripped' },
      ],
    })

    expect(messages).toHaveLength(2)
    expect(messages[1]).toEqual({ role: 'user', content: 'ok' })
  })

  it('strips turns whose content is not a string', () => {
    const messages = buildConciergeMessages({
      systemPrompt: 'S',
      kbMarkdown: 'K',
      history: [
        // @ts-expect-error testing runtime stripping of malformed input
        { role: 'user', content: 123 },
      ],
    })

    expect(messages).toHaveLength(1)
  })

  it('never constructs a message from any field beyond system prompt, KB markdown, and history', () => {
    const messages = buildConciergeMessages({
      systemPrompt: 'S',
      kbMarkdown: 'K',
      history: [{ role: 'assistant', content: 'A' }],
    })

    for (const message of messages) {
      expect(Object.keys(message).sort()).toEqual(['content', 'role'])
    }
  })
})
