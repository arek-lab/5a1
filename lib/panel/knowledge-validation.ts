import { KNOWLEDGE_CATEGORIES, type KnowledgeCategory } from './knowledge-categories'

const KNOWLEDGE_LANGUAGES = ['pl', 'en'] as const
type KnowledgeLanguage = (typeof KNOWLEDGE_LANGUAGES)[number]

export type KnowledgeInput = {
  question: string
  content: string
  category: string
  language: string
  validFromRaw: string
  validUntilRaw: string
}

export type KnowledgeInputValue = {
  question: string | null
  content: string
  category: KnowledgeCategory
  language: KnowledgeLanguage
  validFrom: string | null
  validUntil: string | null
}

export type KnowledgeValidationResult =
  | { ok: true; value: KnowledgeInputValue }
  | { ok: false; error: string }

function isKnowledgeCategory(value: string): value is KnowledgeCategory {
  return (KNOWLEDGE_CATEGORIES as readonly string[]).includes(value)
}

function isKnowledgeLanguage(value: string): value is KnowledgeLanguage {
  return (KNOWLEDGE_LANGUAGES as readonly string[]).includes(value)
}

function parseDate(raw: string): { ok: true; value: string | null } | { ok: false } {
  const trimmed = raw.trim()
  if (!trimmed) return { ok: true, value: null }
  const date = new Date(trimmed)
  if (Number.isNaN(date.getTime())) return { ok: false }
  return { ok: true, value: date.toISOString() }
}

export function validateKnowledgeInput(input: KnowledgeInput): KnowledgeValidationResult {
  const category = input.category.trim()
  if (!isKnowledgeCategory(category)) {
    return { ok: false, error: 'invalidCategory' }
  }

  const language = input.language.trim()
  if (!isKnowledgeLanguage(language)) {
    return { ok: false, error: 'invalidLanguage' }
  }

  const content = input.content.trim()
  if (!content) {
    return { ok: false, error: 'contentRequired' }
  }

  let question: string | null = null
  if (category === 'faq') {
    question = input.question.trim()
    if (!question) {
      return { ok: false, error: 'questionRequired' }
    }
  }

  const validFromParsed = parseDate(input.validFromRaw)
  if (!validFromParsed.ok) {
    return { ok: false, error: 'invalidDateRange' }
  }
  const validUntilParsed = parseDate(input.validUntilRaw)
  if (!validUntilParsed.ok) {
    return { ok: false, error: 'invalidDateRange' }
  }

  if (
    validFromParsed.value &&
    validUntilParsed.value &&
    validFromParsed.value > validUntilParsed.value
  ) {
    return { ok: false, error: 'invalidDateRange' }
  }

  return {
    ok: true,
    value: {
      question,
      content,
      category,
      language,
      validFrom: validFromParsed.value,
      validUntil: validUntilParsed.value,
    },
  }
}
