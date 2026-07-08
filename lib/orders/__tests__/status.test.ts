import { describe, it, expect } from 'vitest'
import { isValidTransition } from '../status'

describe('isValidTransition', () => {
  it('new -> confirmed: allowed', () => {
    expect(isValidTransition('new', 'confirmed')).toBe(true)
  })
  it('new -> rejected: allowed', () => {
    expect(isValidTransition('new', 'rejected')).toBe(true)
  })
  it('new -> fulfilled: not allowed', () => {
    expect(isValidTransition('new', 'fulfilled')).toBe(false)
  })
  it('confirmed -> fulfilled: allowed', () => {
    expect(isValidTransition('confirmed', 'fulfilled')).toBe(true)
  })
  it('confirmed -> rejected: allowed', () => {
    expect(isValidTransition('confirmed', 'rejected')).toBe(true)
  })
  it('confirmed -> new: not allowed', () => {
    expect(isValidTransition('confirmed', 'new')).toBe(false)
  })
  it('fulfilled: terminal, no transitions', () => {
    expect(isValidTransition('fulfilled', 'new')).toBe(false)
    expect(isValidTransition('fulfilled', 'confirmed')).toBe(false)
    expect(isValidTransition('fulfilled', 'rejected')).toBe(false)
  })
  it('rejected: terminal, no transitions', () => {
    expect(isValidTransition('rejected', 'new')).toBe(false)
    expect(isValidTransition('rejected', 'confirmed')).toBe(false)
    expect(isValidTransition('rejected', 'fulfilled')).toBe(false)
  })
})
