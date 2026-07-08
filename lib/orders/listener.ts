import { EventEmitter } from 'events'
import { Client } from 'pg'
import type { Database } from '@/lib/supabase/database.types'

export type OrderRow = Database['public']['Tables']['orders']['Row']

const RECONNECT_DELAY_MS = 1000

// Held on globalThis (not a module-level variable) so Next.js dev hot-reload,
// which re-evaluates this module on every file change, doesn't leak a new
// LISTEN connection to the database on each reload.
const globalForOrdersListener = globalThis as unknown as {
  __ordersListenerEmitter?: EventEmitter
}

function getEmitter(): EventEmitter {
  if (!globalForOrdersListener.__ordersListenerEmitter) {
    const emitter = new EventEmitter()
    emitter.setMaxListeners(0)
    globalForOrdersListener.__ordersListenerEmitter = emitter
    connectAndListen(emitter)
  }
  return globalForOrdersListener.__ordersListenerEmitter
}

function connectAndListen(emitter: EventEmitter): void {
  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL })
  let reconnecting = false

  const reconnect = () => {
    if (reconnecting) return
    reconnecting = true
    client.removeAllListeners()
    setTimeout(() => connectAndListen(emitter), RECONNECT_DELAY_MS)
  }

  client.on('notification', (message) => {
    if (message.channel !== 'orders_changed' || !message.payload) return
    const order = JSON.parse(message.payload) as OrderRow
    emitter.emit(order.property_id, order)
  })
  client.on('error', reconnect)
  client.on('end', reconnect)

  client
    .connect()
    .then(() => client.query('LISTEN orders_changed'))
    .catch(reconnect)
}

export function subscribeToOrderChanges(
  propertyId: string,
  onEvent: (order: OrderRow) => void
): () => void {
  const emitter = getEmitter()
  emitter.on(propertyId, onEvent)
  return () => {
    emitter.off(propertyId, onEvent)
  }
}
