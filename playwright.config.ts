import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/fixtures/seed',
  globalTeardown: './e2e/fixtures/teardown',
  // Jeden deterministyczny scenariusz — bez retry, porażka ma być czerwona od razu
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    // Scenariusz asertuje teksty PL — telefon polskiego gościa (Accept-Language: pl)
    locale: 'pl-PL',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      // Aplikacja gościa jest mobile-first — viewport telefonu jak w realnym użyciu
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: {
    command: 'npm run start',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
