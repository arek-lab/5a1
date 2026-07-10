import { describe, it, expect } from 'vitest'
import { generateTimeSlots } from '../time-slots'

describe('generateTimeSlots', () => {
  it('generates 30-minute slots inclusive of the window bounds', () => {
    expect(generateTimeSlots('07:00:00', '10:00:00')).toEqual([
      '07:00',
      '07:30',
      '08:00',
      '08:30',
      '09:00',
      '09:30',
      '10:00',
    ])
  })

  it('returns an empty array when availableFrom is null', () => {
    expect(generateTimeSlots(null, '10:00:00')).toEqual([])
  })

  it('returns an empty array when availableTo is null', () => {
    expect(generateTimeSlots('07:00:00', null)).toEqual([])
  })

  it('respects a custom step', () => {
    expect(generateTimeSlots('08:00:00', '09:00:00', 15)).toEqual([
      '08:00',
      '08:15',
      '08:30',
      '08:45',
      '09:00',
    ])
  })

  it('returns an empty array when the window is inverted', () => {
    expect(generateTimeSlots('10:00:00', '07:00:00')).toEqual([])
  })
})
