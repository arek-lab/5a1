import { describe, it, expect } from 'vitest'
import { isProfileComplete, computeReadiness } from '../readiness'

const completeProperty = {
  name: 'Hotel Test',
  address: '123 Main St',
  phone_reception: '+48 123 456 789',
  check_in_time: '14:00',
  check_out_time: '11:00',
}

describe('isProfileComplete', () => {
  it('true when all required fields are present', () => {
    expect(isProfileComplete(completeProperty)).toBe(true)
  })

  it('false when name is missing', () => {
    expect(isProfileComplete({ ...completeProperty, name: '' })).toBe(false)
  })

  it('false when address is missing', () => {
    expect(isProfileComplete({ ...completeProperty, address: null })).toBe(false)
  })

  it('false when phone_reception is missing', () => {
    expect(isProfileComplete({ ...completeProperty, phone_reception: null })).toBe(false)
  })

  it('false when check_in_time is missing', () => {
    expect(isProfileComplete({ ...completeProperty, check_in_time: null })).toBe(false)
  })

  it('false when check_out_time is missing', () => {
    expect(isProfileComplete({ ...completeProperty, check_out_time: null })).toBe(false)
  })
})

describe('computeReadiness', () => {
  it('0% when nothing is complete', () => {
    const result = computeReadiness(false, {
      activeServicesCount: 0,
      knowledgeChunksCount: 0,
      activeReceptionQrCount: 0,
    })
    expect(result.percentage).toBe(0)
    expect(result.breakdown).toEqual({
      profile: false,
      services: false,
      knowledge: false,
      qr: false,
    })
  })

  it('25% when only profile is complete', () => {
    const result = computeReadiness(true, {
      activeServicesCount: 0,
      knowledgeChunksCount: 0,
      activeReceptionQrCount: 0,
    })
    expect(result.percentage).toBe(25)
  })

  it('50% when profile and services are complete', () => {
    const result = computeReadiness(true, {
      activeServicesCount: 3,
      knowledgeChunksCount: 0,
      activeReceptionQrCount: 0,
    })
    expect(result.percentage).toBe(50)
  })

  it('services criteria requires at least 3 active services', () => {
    const result = computeReadiness(false, {
      activeServicesCount: 2,
      knowledgeChunksCount: 0,
      activeReceptionQrCount: 0,
    })
    expect(result.breakdown.services).toBe(false)
  })

  it('75% when profile, services, and knowledge are complete', () => {
    const result = computeReadiness(true, {
      activeServicesCount: 3,
      knowledgeChunksCount: 1,
      activeReceptionQrCount: 0,
    })
    expect(result.percentage).toBe(75)
  })

  it('100% when all four criteria are complete', () => {
    const result = computeReadiness(true, {
      activeServicesCount: 5,
      knowledgeChunksCount: 10,
      activeReceptionQrCount: 1,
    })
    expect(result.percentage).toBe(100)
    expect(result.breakdown).toEqual({
      profile: true,
      services: true,
      knowledge: true,
      qr: true,
    })
  })
})
