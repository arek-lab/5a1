'use client'

import { useTranslations } from 'next-intl'

type RoomQr = {
  id: string
  roomNumber: string
  roomType: string | null
  image: string
}

interface Props {
  rooms: RoomQr[]
  skippedCount: number
}

export default function PrintRoomQrList({ rooms, skippedCount }: Props) {
  const t = useTranslations('qr')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        {skippedCount > 0 && (
          <p className="text-sm text-gray-600">{t('print.skippedRooms', { count: skippedCount })}</p>
        )}
        <button
          type="button"
          className="rounded border px-3 py-1.5 text-sm font-medium hover:bg-gray-100 hover:text-gray-900"
          onClick={() => window.print()}
        >
          {t('print.printButton')}
        </button>
      </div>

      {rooms.length === 0 ? (
        <p className="italic text-gray-500 print:hidden">{t('print.empty')}</p>
      ) : (
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 print:block">
          {rooms.map(room => (
            <div
              key={room.id}
              className="flex flex-col items-center gap-2 rounded border p-4 print:break-after-page print:border-0 print:p-0"
            >
              <div className="h-40 w-40" dangerouslySetInnerHTML={{ __html: room.image }} />
              <p className="text-center font-medium">
                {room.roomNumber}
                {room.roomType && <span className="ml-1 text-sm text-gray-500">({room.roomType})</span>}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
