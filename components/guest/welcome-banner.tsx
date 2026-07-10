export function WelcomeBanner({ guestFirstName }: { guestFirstName: string | null }) {
  return (
    <div className="px-4 py-6">
      <h1 className="text-xl font-semibold text-gray-900">
        {guestFirstName ? `Witaj, ${guestFirstName}!` : 'Witaj!'}
      </h1>
    </div>
  );
}
