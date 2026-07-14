import { requireGuestSession } from '@/lib/guest/require-session';
import { ConciergeChatLoader } from '@/components/guest/concierge-chat-loader';

export default async function ConciergePage() {
  const { aiBotName, phoneReception } = await requireGuestSession();

  return (
    <main className="flex h-full flex-col px-4 py-4">
      <ConciergeChatLoader aiBotName={aiBotName} phoneReception={phoneReception} />
    </main>
  );
}
