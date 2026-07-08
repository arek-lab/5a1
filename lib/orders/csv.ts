import type { OrderStatus } from './status'

export type OrderCsvRow = {
  createdAt: string
  roomNumber: string
  serviceName: string
  priceCents: number | null
  status: OrderStatus
  note: string
}

const CSV_HEADER = ['Data', 'Pokój', 'Usługa', 'Cena', 'Status', 'Uwagi']

export function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function formatPrice(priceCents: number | null): string {
  return priceCents === null ? '' : (priceCents / 100).toFixed(2)
}

export function buildOrdersCsv(rows: OrderCsvRow[]): string {
  const lines = rows.map(row =>
    [
      new Date(row.createdAt).toISOString(),
      row.roomNumber,
      row.serviceName,
      formatPrice(row.priceCents),
      row.status,
      row.note,
    ]
      .map(csvEscape)
      .join(',')
  )
  return [CSV_HEADER.join(','), ...lines].join('\n')
}
