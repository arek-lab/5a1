import * as Sentry from '@sentry/nextjs'
import { NextResponse, type NextRequest } from 'next/server'
import { revokeExpiredSessions, deleteRetainedSessions, purgeOldAuditLogs } from '@/lib/retention/sweep'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = request.headers.get('x-cron-secret')
  if (!secret || secret !== process.env.CRON_SECRET) {
    return new NextResponse(null, { status: 401 })
  }

  let revoked = 0
  let deleted = 0
  let purged = 0
  const errors: string[] = []

  try {
    revoked = (await revokeExpiredSessions()).count
  } catch (error) {
    Sentry.captureException(error)
    errors.push('revokeExpiredSessions failed')
  }

  try {
    deleted = (await deleteRetainedSessions()).count
  } catch (error) {
    Sentry.captureException(error)
    errors.push('deleteRetainedSessions failed')
  }

  try {
    purged = (await purgeOldAuditLogs()).count
  } catch (error) {
    Sentry.captureException(error)
    errors.push('purgeOldAuditLogs failed')
  }

  return NextResponse.json({ revoked, deleted, purged, errors })
}
