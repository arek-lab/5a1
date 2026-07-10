function parseMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function generateTimeSlots(
  availableFrom: string | null,
  availableTo: string | null,
  stepMinutes = 30
): string[] {
  if (!availableFrom || !availableTo) return []

  const start = parseMinutes(availableFrom)
  const end = parseMinutes(availableTo)
  if (start > end) return []

  const slots: string[] = []
  for (let minutes = start; minutes <= end; minutes += stepMinutes) {
    slots.push(formatMinutes(minutes))
  }
  return slots
}
