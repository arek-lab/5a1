import { describe, it, expect } from 'vitest'
import { csvEscape, buildOrdersCsv } from '../csv'

describe('csvEscape', () => {
  it('leaves plain values untouched', () => {
    expect(csvEscape('room service')).toBe('room service')
  })

  it('quotes and escapes values containing commas', () => {
    expect(csvEscape('a,b')).toBe('"a,b"')
  })

  it('quotes and doubles embedded quotes', () => {
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""')
  })

  it('quotes values containing newlines', () => {
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"')
  })
})

describe('buildOrdersCsv', () => {
  it('renders a header row and one row per order', () => {
    const csv = buildOrdersCsv([
      {
        createdAt: '2026-07-08T10:00:00.000Z',
        roomNumber: '101',
        serviceName: 'Breakfast, in room',
        priceCents: 1250,
        status: 'new',
        note: 'no onions',
      },
    ])

    const lines = csv.split('\n')
    expect(lines[0]).toBe('Data,Pokój,Usługa,Cena,Status,Uwagi')
    expect(lines[1]).toBe('2026-07-08T10:00:00.000Z,101,"Breakfast, in room",12.50,new,no onions')
  })

  it('renders an empty price as an empty field', () => {
    const csv = buildOrdersCsv([
      {
        createdAt: '2026-07-08T10:00:00.000Z',
        roomNumber: '',
        serviceName: 'Massage',
        priceCents: null,
        status: 'fulfilled',
        note: '',
      },
    ])

    expect(csv.split('\n')[1]).toBe('2026-07-08T10:00:00.000Z,,Massage,,fulfilled,')
  })
})
