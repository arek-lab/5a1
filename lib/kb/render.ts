import { KB_SECTION_ORDER, type KbSectionKey, type KbSections } from './types'

const SECTION_TITLES: Record<KbSectionKey, string> = {
  faq: 'FAQ',
  services: 'Usługi',
  restaurant: 'Menu',
  policies: 'Polityki',
  local: 'Okolica',
}

export function renderKbMarkdown(sections: KbSections): string {
  const blocks: string[] = []

  for (const key of KB_SECTION_ORDER) {
    const rows = sections[key]
    if (!rows || rows.length === 0) continue

    const body = rows
      .map(row => (row.question !== null ? `**Q:** ${row.question}\n${row.content}` : row.content))
      .join('\n\n')

    blocks.push(`## ${SECTION_TITLES[key]}\n\n${body}`)
  }

  return blocks.join('\n\n')
}
