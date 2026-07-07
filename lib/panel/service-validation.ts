import { SERVICE_CATEGORIES, type ServiceCategory } from './service-categories'

export type ServiceInput = {
  name: string
  category: string
  priceCentsRaw: string
  imageUrl: string
}

export type ServiceInputValue = {
  name: string
  category: ServiceCategory
  priceCents: number | null
  imageUrl: string | null
}

export type ServiceValidationResult =
  | { ok: true; value: ServiceInputValue }
  | { ok: false; error: string }

function isServiceCategory(value: string): value is ServiceCategory {
  return (SERVICE_CATEGORIES as readonly string[]).includes(value)
}

export function validateServiceInput(input: ServiceInput): ServiceValidationResult {
  const name = input.name.trim()
  if (!name) {
    return { ok: false, error: 'nameRequired' }
  }

  const category = input.category.trim()
  if (!isServiceCategory(category)) {
    return { ok: false, error: 'invalidCategory' }
  }

  const priceRaw = input.priceCentsRaw.trim()
  let priceCents: number | null = null
  if (priceRaw) {
    const parsed = Number(priceRaw)
    if (!Number.isInteger(parsed) || parsed < 0) {
      return { ok: false, error: 'invalidPrice' }
    }
    priceCents = parsed
  }

  const imageUrl = input.imageUrl.trim()
  if (imageUrl) {
    try {
      new URL(imageUrl)
    } catch {
      return { ok: false, error: 'invalidUrl' }
    }
  }

  return { ok: true, value: { name, category, priceCents, imageUrl: imageUrl || null } }
}

export function wouldExceedPinLimit(otherPinnedCount: number): boolean {
  return otherPinnedCount >= 3
}
