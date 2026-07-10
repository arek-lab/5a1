import Link from 'next/link';

export function FloatingConciergeButton() {
  return (
    <Link
      href="/concierge"
      aria-label="Concierge"
      className="fixed bottom-4 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gray-900 text-white shadow-lg hover:bg-gray-700"
    >
      <span aria-hidden="true" className="text-2xl">💬</span>
    </Link>
  );
}
