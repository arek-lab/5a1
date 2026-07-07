export const KNOWLEDGE_CATEGORIES = ['faq', 'local'] as const

export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number]
