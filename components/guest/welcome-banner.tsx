import Link from 'next/link';

export function WelcomeBanner({
  guestFirstName,
  roomNumber,
}: {
  guestFirstName: string | null;
  roomNumber: string | null;
}) {
  if (!guestFirstName && !roomNumber) {
    return (
      <div className="px-4 py-6">
        <Link
          href="/scan"
          className="inline-flex items-center justify-center rounded-full bg-gray-900 px-6 py-3 text-base font-semibold text-white hover:bg-gray-700"
        >
          Skanuj kod pokoju
        </Link>
      </div>
    );
  }

  const greeting = guestFirstName ? `Witaj, ${guestFirstName}!` : `Witamy w pokoju ${roomNumber}`;

  return (
    <div className="px-4 py-6">
      <h1 className="text-xl font-semibold text-foreground">{greeting}</h1>
    </div>
  );
}
