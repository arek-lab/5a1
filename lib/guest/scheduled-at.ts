function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = part.value
      return acc
    }, {})

  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  )
  return asUTC - date.getTime()
}

// Interprets `scheduledTime` ("HH:MM") as today's date in `timeZone`, then converts
// that wall-clock instant to a UTC ISO string for storage in a TIMESTAMPTZ column.
export function buildScheduledAt(timeZone: string, scheduledTime: string, now: Date = new Date()): string {
  const todayInZone = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)

  const naiveUtc = new Date(`${todayInZone}T${scheduledTime}:00Z`)
  const offset = getTimeZoneOffsetMs(naiveUtc, timeZone)
  return new Date(naiveUtc.getTime() - offset).toISOString()
}
