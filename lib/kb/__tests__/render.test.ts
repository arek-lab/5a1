import { describe, it, expect } from 'vitest'
import { renderKbMarkdown } from '../render'
import type { KbSections } from '../types'

function emptySections(): KbSections {
  return { faq: [], services: [], restaurant: [], policies: [], local: [] }
}

describe('renderKbMarkdown', () => {
  it('renders Q&A rows differently from whole-document rows', () => {
    const sections: KbSections = {
      ...emptySections(),
      faq: [{ question: 'Kiedy jest check-in?', content: 'Od 14:00.', hash: 'h1' }],
      restaurant: [{ question: null, content: '# Menu\nŚniadanie 7-10.', hash: 'h2' }],
    }

    const markdown = renderKbMarkdown(sections)

    expect(markdown).toContain('**Q:** Kiedy jest check-in?\nOd 14:00.')
    expect(markdown).toContain('# Menu\nŚniadanie 7-10.')
    expect(markdown).not.toContain('**Q:** # Menu')
  })

  it('omits headings for empty sections', () => {
    const sections: KbSections = {
      ...emptySections(),
      faq: [{ question: 'Q', content: 'A', hash: 'h1' }],
    }

    const markdown = renderKbMarkdown(sections)

    expect(markdown).toContain('## FAQ')
    expect(markdown).not.toContain('## Usługi')
    expect(markdown).not.toContain('## Menu')
    expect(markdown).not.toContain('## Polityki')
    expect(markdown).not.toContain('## Okolica')
  })

  it('returns an empty string when every section is empty', () => {
    expect(renderKbMarkdown(emptySections())).toBe('')
  })

  it('always orders sections as faq -> services -> restaurant -> policies -> local, regardless of input key order', () => {
    const sections: KbSections = {
      local: [{ question: null, content: 'Local content', hash: 'h5' }],
      policies: [{ question: null, content: 'Policy content', hash: 'h4' }],
      restaurant: [{ question: null, content: 'Menu content', hash: 'h3' }],
      services: [{ question: null, content: 'Service content', hash: 'h2' }],
      faq: [{ question: 'Q', content: 'A', hash: 'h1' }],
    }

    const markdown = renderKbMarkdown(sections)

    const order = ['## FAQ', '## Usługi', '## Menu', '## Polityki', '## Okolica']
    const indices = order.map(heading => markdown.indexOf(heading))
    expect(indices).toEqual([...indices].sort((a, b) => a - b))
    expect(indices.every(i => i >= 0)).toBe(true)
  })
})
