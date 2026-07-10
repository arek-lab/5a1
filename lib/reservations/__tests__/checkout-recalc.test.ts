import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { checkInRoom, RoomOccupiedError, InvalidCheckOutError } from '@/lib/reservations/check-in'
import { updateReservationCheckOut, ReservationNotFoundError } from '@/lib/reservations/update-checkout'

let propertyId: string
let roomId: string
let vacantRoomId: string
let reservationId: string
let activeSessionAId: string
let activeSessionBId: string
let revokedSessionId: string
let wrongLevelSessionId: string

describe('Phase 1: checkInRoom / updateReservationCheckOut (real Supabase)', () => {
  beforeAll(async () => {
    const db = createServiceRoleClient()

    const { data: property, error: propErr } = await db
      .from('properties')
      .insert({ name: 'S2.9 Test Property', timezone: 'UTC', dpa_signed_at: new Date().toISOString() })
      .select()
      .single()
    if (propErr) throw propErr
    propertyId = property.id

    const { data: room, error: roomErr } = await db
      .from('rooms')
      .insert({ property_id: propertyId, room_number: '201' })
      .select()
      .single()
    if (roomErr) throw roomErr
    roomId = room.id

    const { data: vacantRoom, error: vacantRoomErr } = await db
      .from('rooms')
      .insert({ property_id: propertyId, room_number: '202' })
      .select()
      .single()
    if (vacantRoomErr) throw vacantRoomErr
    vacantRoomId = vacantRoom.id

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    const { data: reservation, error: resErr } = await db
      .from('reservations')
      .insert({
        property_id: propertyId,
        room_id: roomId,
        check_in: new Date().toISOString(),
        check_out: tomorrow,
        source: 'direct',
        status: 'checked_in',
      })
      .select()
      .single()
    if (resErr) throw resErr
    reservationId = reservation.id

    const { error: roomUpdateErr } = await db
      .from('rooms')
      .update({
        room_active_reservation_id: reservationId,
        valid_from: new Date().toISOString(),
        valid_until: tomorrow,
      })
      .eq('id', roomId)
    if (roomUpdateErr) throw roomUpdateErr

    const farFuture = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()

    const { data: sessionA, error: sessAErr } = await db
      .from('sessions')
      .insert({
        property_id: propertyId,
        auth_level: 2,
        reservation_id: reservationId,
        room_id: roomId,
        expires_at: farFuture,
        revoked: false,
      })
      .select()
      .single()
    if (sessAErr) throw sessAErr
    activeSessionAId = sessionA.id

    const { data: sessionB, error: sessBErr } = await db
      .from('sessions')
      .insert({
        property_id: propertyId,
        auth_level: 2,
        reservation_id: reservationId,
        room_id: roomId,
        expires_at: farFuture,
        revoked: false,
      })
      .select()
      .single()
    if (sessBErr) throw sessBErr
    activeSessionBId = sessionB.id

    const { data: revokedSession, error: revokedErr } = await db
      .from('sessions')
      .insert({
        property_id: propertyId,
        auth_level: 2,
        reservation_id: reservationId,
        room_id: roomId,
        expires_at: farFuture,
        revoked: true,
      })
      .select()
      .single()
    if (revokedErr) throw revokedErr
    revokedSessionId = revokedSession.id

    const { data: wrongLevelSession, error: wrongLevelErr } = await db
      .from('sessions')
      .insert({
        property_id: propertyId,
        auth_level: 1,
        reservation_id: reservationId,
        expires_at: farFuture,
        revoked: false,
      })
      .select()
      .single()
    if (wrongLevelErr) throw wrongLevelErr
    wrongLevelSessionId = wrongLevelSession.id
  }, 30_000)

  afterAll(async () => {
    const db = createServiceRoleClient()
    await db.from('rooms').update({ room_active_reservation_id: null }).eq('property_id', propertyId)
    await db.from('sessions').delete().eq('property_id', propertyId)
    await db.from('audit_logs').delete().eq('property_id', propertyId)
    await db.from('reservations').delete().eq('property_id', propertyId)
    await db.from('rooms').delete().eq('property_id', propertyId)
    await db.from('properties').delete().eq('id', propertyId)
  }, 30_000)

  it('checkInRoom creates a reservation on a vacant room', async () => {
    const checkOut = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const reservation = await checkInRoom(propertyId, vacantRoomId, checkOut)

    expect(reservation.room_id).toBe(vacantRoomId)
    expect(reservation.status).toBe('checked_in')
    expect(reservation.guest_first_name).toBeNull()

    const db = createServiceRoleClient()
    const { data: room } = await db.from('rooms').select().eq('id', vacantRoomId).single()
    expect(room?.room_active_reservation_id).toBe(reservation.id)
    expect(new Date(room!.valid_until!).getTime()).toBe(new Date(checkOut).getTime())
  })

  it('checkInRoom rejects a second check-in on an already occupied room', async () => {
    const checkOut = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    await expect(checkInRoom(propertyId, roomId, checkOut)).rejects.toThrow(RoomOccupiedError)
  })

  it('updateReservationCheckOut recalculates expires_at for active sessions only', async () => {
    const newCheckOut = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()
    await updateReservationCheckOut(propertyId, reservationId, newCheckOut)

    const expectedExpiresAt = new Date(new Date(newCheckOut).getTime() + 2 * 60 * 60 * 1000).toISOString()

    const expectedExpiresAtMs = new Date(expectedExpiresAt).getTime()

    const db = createServiceRoleClient()

    const { data: sessionA } = await db.from('sessions').select().eq('id', activeSessionAId).single()
    expect(new Date(sessionA!.expires_at).getTime()).toBe(expectedExpiresAtMs)

    const { data: sessionB } = await db.from('sessions').select().eq('id', activeSessionBId).single()
    expect(new Date(sessionB!.expires_at).getTime()).toBe(expectedExpiresAtMs)

    const { data: revoked } = await db.from('sessions').select().eq('id', revokedSessionId).single()
    expect(new Date(revoked!.expires_at).getTime()).not.toBe(expectedExpiresAtMs)

    const { data: wrongLevel } = await db.from('sessions').select().eq('id', wrongLevelSessionId).single()
    expect(new Date(wrongLevel!.expires_at).getTime()).not.toBe(expectedExpiresAtMs)

    const { data: room } = await db.from('rooms').select().eq('id', roomId).single()
    expect(new Date(room!.valid_until!).getTime()).toBe(new Date(newCheckOut).getTime())

    const { data: reservation } = await db.from('reservations').select().eq('id', reservationId).single()
    expect(new Date(reservation!.check_out).getTime()).toBe(new Date(newCheckOut).getTime())
  })

  it('updateReservationCheckOut rejects a check-out in the past without side effects', async () => {
    const db = createServiceRoleClient()
    const { data: before } = await db.from('reservations').select('check_out').eq('id', reservationId).single()

    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    await expect(updateReservationCheckOut(propertyId, reservationId, past)).rejects.toThrow(InvalidCheckOutError)

    const { data: after } = await db.from('reservations').select('check_out').eq('id', reservationId).single()
    expect(after?.check_out).toBe(before?.check_out)
  })

  it('updateReservationCheckOut throws for an unknown reservation', async () => {
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    await expect(
      updateReservationCheckOut(propertyId, '00000000-0000-0000-0000-000000000000', futureDate)
    ).rejects.toThrow(ReservationNotFoundError)
  })
})
