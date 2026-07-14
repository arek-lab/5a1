import { requireGuestSession } from '@/lib/guest/require-session';
import { ConciergeChat } from '@/components/guest/concierge-chat';

export default async function ConciergePage() {
  const { aiBotName, phoneReception } = await requireGuestSession();

  return (
    <main className="flex h-full flex-col px-4 py-4">
      <ConciergeChat aiBotName={aiBotName} phoneReception={phoneReception} />
    </main>
  );
}
