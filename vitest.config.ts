import path from 'path'
import { loadEnv } from 'vite'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    test: {
      environment: 'node',
      globals: true,
      env,
      // Specy Playwrighta (e2e/*.spec.ts) wpadają w domyślny include vitest
      exclude: [...configDefaults.exclude, 'e2e/**'],
      // Retention IT tests (sweep.test.ts, it-8.test.ts) both mutate the
      // sessions/audit_logs tables globally (no property_id scoping) — running
      // test files in parallel races their fixtures against each other.
      fileParallelism: false,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  }
})
