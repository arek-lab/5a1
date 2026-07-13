import { computeContentHash } from '@/lib/panel/knowledge-hash'
import { KB_SECTION_ORDER, type KbSections } from './types'

export function computeCompositeHash(sections: KbSections): string {
  const rowHashes: string[] = []
  for (const key of KB_SECTION_ORDER) {
    for (const row of sections[key]) {
      rowHashes.push(row.hash)
    }
  }
  return computeContentHash(rowHashes.join('|'))
}
