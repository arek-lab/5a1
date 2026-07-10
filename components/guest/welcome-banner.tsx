export function WelcomeBanner({
  guestFirstName,
  roomNumber,
}: {
  guestFirstName: string | null;
  roomNumber: string | null;
}) {
  const greeting = guestFirstName
    ? `Witaj, ${guestFirstName}!`
    : roomNumber
      ? `Witamy w pokoju ${roomNumber}`
      : 'Witaj!';

  return (
    <div className="px-4 py-6">
      <h1 className="text-xl font-semibold text-foreground">{greeting}</h1>
    </div>
  );
}
