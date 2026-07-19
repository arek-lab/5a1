import fs from 'node:fs'
import { test, expect } from '@playwright/test'
import { SEED_STATE_PATH, type SeedState } from './fixtures/seed'

// E2E-01 (roadmapa §9.3, MUST — gate przed pilotem): pełny happy path gościa.
// Wejście przez URL-e tokenów QR (bez fizycznego skanu), przeciwko buildowi
// produkcyjnemu z hotelem seedowanym w global setup.
//
// HITL #1: gość NIC nie wpisuje — spec nie zawiera żadnego fill()/type()/pressSequentially().
// HITL #5: zero pola karty — jawna asercja przed złożeniem zamówienia.

const state = (): SeedState => JSON.parse(fs.readFileSync(SEED_STATE_PATH, 'utf8')) as SeedState

test('E2E-01: skan QR → zamówienie na rachunek → status „złożone"', async ({ page }) => {
  const { initToken, roomId, roomNumber, serviceName, category } = state()

  // Krok 1: skan QR recepcji (auth_level 1) — sesja anonimowa, redirect na home
  await page.goto(`/api/scan/reception?init_token=${initToken}`)
  await expect(page).toHaveURL(/\/(pl\/?)?$/)

  // Krok 2: skan QR pokoju (step-up do auth_level 2) — przypina rezerwację
  await page.goto(`/api/scan/room?room_id=${roomId}`)
  await expect(page).toHaveURL(/\/(pl\/?)?$/)

  // Krok 3: welcome — „Witamy w pokoju {nr}", bez imienia (minimalizacja PII,
  // s2-9: guest_first_name = NULL w realnym przepływie recepcji)
  await expect(page.getByText(`Witamy w pokoju ${roomNumber}`)).toBeVisible()

  // Baner analityki (fixed bottom, z-50) zasłania dolny arkusz modala — zamknij go
  // jak realny gość, zanim ruszymy dalej
  await page.getByRole('button', { name: 'Rozumiem' }).click()

  // Krok 4: home → lista usług → kategoria
  await page.getByRole('link', { name: 'Zobacz co dla Ciebie przygotowaliśmy' }).click()
  await expect(page.getByRole('heading', { name: 'Udogodnienia' })).toBeVisible()
  await page.getByRole('link', { name: 'Usługi pokojowe' }).click()
  await expect(page).toHaveURL(new RegExp(`/c/${category}`))

  // Krok 5: usługa → szczegóły z ceną
  await page.getByRole('link', { name: new RegExp(serviceName) }).click()
  await expect(page.getByRole('heading', { name: serviceName })).toBeVisible()
  await expect(page.getByText('12.00')).toBeVisible()

  // Krok 6: modal zamówienia
  await page.getByRole('button', { name: 'Zamów' }).click()
  await expect(page.getByText('Potwierdź zamówienie')).toBeVisible()

  // HITL #5: żadnych pól płatności w całej ścieżce zamówienia
  await expect(page.locator('input[autocomplete^="cc-"]')).toHaveCount(0)
  await expect(page.locator('input[name*="card" i], input[id*="card" i]')).toHaveCount(0)
  // Jedyne pole w modalu to opcjonalna uwaga — musi być puste (HITL #1: nic nie wpisujemy)
  await expect(page.locator('textarea')).toHaveValue('')

  // Krok 7: „Dopisz do rachunku pokoju" → ekran sukcesu
  await page.getByRole('button', { name: 'Dopisz do rachunku pokoju' }).click()
  await expect(page).toHaveURL(/\/order-success/)
  await expect(page.getByText('Zamówienie złożone')).toBeVisible()

  // Krok 8: „Moje zamówienia" — zamówienie ze statusem „Złożone"
  await page.getByRole('link', { name: 'Zobacz moje zamówienia' }).click()
  await expect(page.getByRole('heading', { name: 'Moje zamówienia' })).toBeVisible()
  await expect(page.getByText(serviceName)).toBeVisible()
  await expect(page.getByText('Złożone', { exact: true })).toBeVisible()
})
