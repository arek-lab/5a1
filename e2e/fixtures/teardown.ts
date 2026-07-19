import fs from 'node:fs'
import { cleanupProperty, loadEnv, SEED_STATE_PATH, type SeedState } from './seed'

export default async function globalTeardown(): Promise<void> {
  if (!fs.existsSync(SEED_STATE_PATH)) return
  loadEnv()
  const state = JSON.parse(fs.readFileSync(SEED_STATE_PATH, 'utf8')) as SeedState
  await cleanupProperty(state.propertyId)
  fs.unlinkSync(SEED_STATE_PATH)
}
