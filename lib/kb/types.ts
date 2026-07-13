export type KbSectionKey = 'faq' | 'services' | 'restaurant' | 'policies' | 'local'

export const KB_SECTION_ORDER: KbSectionKey[] = [
  'faq',
  'services',
  'restaurant',
  'policies',
  'local',
]

export type KbRow = {
  question: string | null
  content: string
  hash: string
}

export type KbSections = Record<KbSectionKey, KbRow[]>
