import fs from 'node:fs'
import path from 'node:path'
import { loadEnvConfig } from '@next/env'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

// Unikalna nazwa identyfikuje fixture E2E we współdzielonej bazie Supabase —
// teardown i sprzątanie po przerwanych przebiegach kasują wyłącznie po tym property.
export const E2E_PROPERTY_NAME = 'E2E-01 Test Property'

export const SEED_STATE_PATH = path.join(__dirname, '.seed-state.json')

export interface SeedState {
  propertyId: string
  roomId: string
  initToken: string
  serviceId: string
  category: string
  serviceName: string
  roomNumber: string
}

export function loadEnv(): void {
  loadEnvConfig(process.cwd())
}

export async function cleanupProperty(propertyId: string): Promise<void> {
  const db = createServiceRoleClient()
  // rooms→reservations to cykliczny FK — najpierw go zerwij (wzorzec z it-2.test.ts)
  await db.from('rooms').update({ room_active_reservation_id: null }).eq('property_id', propertyId)
  await db.from('orders').delete().eq('property_id', propertyId)
  await db.from('sessions').delete().eq('property_id', propertyId)
  await db.from('qr_codes').delete().eq('property_id', propertyId)
  await db.from('services').delete().eq('property_id', propertyId)
  await db.from('reservations').delete().eq('property_id', propertyId)
  await db.from('rooms').delete().eq('property_id', propertyId)
  await db.from('properties').delete().eq('id', propertyId)
}

export default async function globalSetup(): Promise<void> {
  loadEnv()
  const db = createServiceRoleClient()

  // Przerwany poprzedni przebieg (crash, ctrl+c) zostawia fixture — sprzątnij przed seedem
  const { data: stale } = await db.from('properties').select('id').eq('name', E2E_PROPERTY_NAME)
  for (const row of stale ?? []) {
    await cleanupProperty(row.id)
  }

  const { data: property, error: propErr } = await db
    .from('properties')
    .insert({ name: E2E_PROPERTY_NAME, timezone: 'UTC', dpa_signed_at: new Date().toISOString() })
    .select()
    .single()
  if (propErr) throw propErr

  const { data: room, error: roomErr } = await db
    .from('rooms')
    .insert({ property_id: property.id, room_number: '901' })
    .select()
    .single()
  if (roomErr) throw roomErr

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  const { data: reservation, error: resErr } = await db
    .from('reservations')
    .insert({
      property_id: property.id,
      room_id: room.id,
      // Bez imienia — minimalizacja PII (s2-9, korekta HITL): recepcja melduje
      // tylko pokój + datę wyjazdu, welcome pokazuje „Witamy w pokoju {nr}"
      check_in: yesterday,
      check_out: tomorrow,
      source: 'direct',
      status: 'checked_in',
    })
    .select()
    .single()
  if (resErr) throw resErr

  const { error: roomUpdateErr } = await db
    .from('rooms')
    .update({
      room_active_reservation_id: reservation.id,
      valid_from: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      valid_until: tomorrow,
    })
    .eq('id', room.id)
  if (roomUpdateErr) throw roomUpdateErr

  const { data: receptionQr, error: qrErr } = await db
    .from('qr_codes')
    .insert({
      property_id: property.id,
      type: 'reception',
      is_active: true,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    })
    .select()
    .single()
  if (qrErr) throw qrErr

  const { error: roomQrErr } = await db.from('qr_codes').insert({
    property_id: property.id,
    type: 'room',
    room_id: room.id,
    is_active: true,
  })
  if (roomQrErr) throw roomQrErr

  const { data: service, error: svcErr } = await db
    .from('services')
    .insert({
      property_id: property.id,
      name: 'Woda mineralna E2E',
      description: 'Butelka wody mineralnej 0,5 l',
      category: 'room_service',
      price_cents: 1200,
      is_active: true,
      is_pinned: true,
    })
    .select()
    .single()
  if (svcErr) throw svcErr

  const state: SeedState = {
    propertyId: property.id,
    roomId: room.id,
    initToken: receptionQr.init_token,
    serviceId: service.id,
    category: 'room_service',
    serviceName: service.name,
    roomNumber: '901',
  }
  fs.writeFileSync(SEED_STATE_PATH, JSON.stringify(state, null, 2))
}
