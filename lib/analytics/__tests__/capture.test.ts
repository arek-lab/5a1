import { describe, it, expect, vi, beforeEach } from 'vitest';

const captureMock = vi.fn();
const flushMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/posthog/server', () => ({
  posthogServer: {
    capture: (...args: unknown[]) => captureMock(...args),
    flush: (...args: unknown[]) => flushMock(...args),
  },
}));

const captureExceptionMock = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => captureExceptionMock(...args),
}));

import { captureEvent } from '../capture';

beforeEach(() => {
  captureMock.mockReset();
  flushMock.mockReset().mockResolvedValue(undefined);
  captureExceptionMock.mockReset();
});

describe('captureEvent', () => {
  it('sets groups.hotel_id from ctx.propertyId', async () => {
    await captureEvent(
      { name: 'hotel_login', properties: {} },
      { distinctId: 'user-1', propertyId: 'property-1' },
    );

    expect(captureMock).toHaveBeenCalledWith(
      expect.objectContaining({
        distinctId: 'user-1',
        event: 'hotel_login',
        properties: {},
        groups: { hotel_id: 'property-1' },
      }),
    );
    expect(flushMock).toHaveBeenCalled();
  });

  it('reports to Sentry and never throws when capture fails', async () => {
    captureMock.mockImplementation(() => {
      throw new Error('posthog down');
    });

    await expect(
      captureEvent(
        { name: 'hotel_login', properties: {} },
        { distinctId: 'user-1', propertyId: 'property-1' },
      ),
    ).resolves.toBeUndefined();

    expect(captureExceptionMock).toHaveBeenCalledWith(expect.any(Error));
  });

  it('reports to Sentry and never throws when flush fails', async () => {
    flushMock.mockRejectedValue(new Error('flush failed'));

    await expect(
      captureEvent(
        { name: 'hotel_login', properties: {} },
        { distinctId: 'user-1', propertyId: 'property-1' },
      ),
    ).resolves.toBeUndefined();

    expect(captureExceptionMock).toHaveBeenCalledWith(expect.any(Error));
  });
});
