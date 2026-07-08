import * as Sentry from '@sentry/nextjs';
import { posthogServer } from '@/lib/posthog/server';
import type { AnalyticsEvent } from '@/lib/analytics/events';

export async function captureEvent(
  event: AnalyticsEvent,
  ctx: { distinctId: string; propertyId: string },
): Promise<void> {
  try {
    posthogServer.capture({
      distinctId: ctx.distinctId,
      event: event.name,
      properties: event.properties,
      groups: { hotel_id: ctx.propertyId },
    });
    await posthogServer.flush();
  } catch (error) {
    Sentry.captureException(error);
  }
}
