import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/retention/sweep', () => ({
  revokeExpiredSessions: vi.fn(),
  deleteRetainedSessions: vi.fn(),
  purgeOldAuditLogs: vi.fn(),
}))
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}))

import { revokeExpiredSessions, deleteRetainedSessions, purgeOldAuditLogs } from '@/lib/retention/sweep'
import { captureException } from '@sentry/nextjs'
import { POST } from '../route'

const mockRevoke = vi.mocked(revokeExpiredSessions)
const mockDelete = vi.mocked(deleteRetainedSessions)
const mockPurge = vi.mocked(purgeOldAuditLogs)
const mockCaptureException = vi.mocked(captureException)

function makeRequest(secret?: string): NextRequest {
  return new NextRequest('http://localhost:3000/api/cron/retention', {
    method: 'POST',
    headers: secret ? { 'x-cron-secret': secret } : {},
  })
}

describe('POST /api/cron/retention', () => {
  const originalSecret = process.env.CRON_SECRET

  beforeEach(() => {
    vi.resetAllMocks()
    process.env.CRON_SECRET = 'test-secret'
  })

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret
  })

  it('returns 401 and never calls sweep functions when the secret is missing', async () => {
    const response = await POST(makeRequest())

    expect(response.status).toBe(401)
    expect(mockRevoke).not.toHaveBeenCalled()
    expect(mockDelete).not.toHaveBeenCalled()
    expect(mockPurge).not.toHaveBeenCalled()
  })

  it('returns 401 and never calls sweep functions when the secret is wrong', async () => {
    const response = await POST(makeRequest('wrong-secret'))

    expect(response.status).toBe(401)
    expect(mockRevoke).not.toHaveBeenCalled()
  })

  it('returns 200 with a summary when the secret is correct', async () => {
    mockRevoke.mockResolvedValue({ count: 2 })
    mockDelete.mockResolvedValue({ count: 1 })
    mockPurge.mockResolvedValue({ count: 5 })

    const response = await POST(makeRequest('test-secret'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ revoked: 2, deleted: 1, purged: 5, errors: [] })
  })

  it('isolates a failure in one rule and still reports the others, capturing the error', async () => {
    mockRevoke.mockResolvedValue({ count: 3 })
    mockDelete.mockRejectedValue(new Error('delete failed'))
    mockPurge.mockResolvedValue({ count: 4 })

    const response = await POST(makeRequest('test-secret'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ revoked: 3, deleted: 0, purged: 4, errors: ['deleteRetainedSessions failed'] })
    expect(mockCaptureException).toHaveBeenCalledWith(expect.any(Error))
  })
})
