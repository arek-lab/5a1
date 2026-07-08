export function isDoNotTrackEnabled(): boolean {
  return typeof navigator !== 'undefined' && navigator.doNotTrack === '1';
}
