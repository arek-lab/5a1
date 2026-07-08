import { describe, it, expect, afterEach, vi } from 'vitest';
import { isDoNotTrackEnabled } from '../dnt';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isDoNotTrackEnabled', () => {
  it('returns true when navigator.doNotTrack is "1"', () => {
    vi.stubGlobal('navigator', { doNotTrack: '1' });
    expect(isDoNotTrackEnabled()).toBe(true);
  });

  it('returns false when navigator.doNotTrack is not "1"', () => {
    vi.stubGlobal('navigator', { doNotTrack: '0' });
    expect(isDoNotTrackEnabled()).toBe(false);
  });

  it('returns false when navigator is undefined', () => {
    vi.stubGlobal('navigator', undefined);
    expect(isDoNotTrackEnabled()).toBe(false);
  });
});
