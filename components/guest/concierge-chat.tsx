'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ConciergeTurn } from '@/lib/concierge/payload';

const MAX_HISTORY_TURNS = 10;
const FALLBACK_PREFIX = '[FALLBACK]';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isFallback: boolean;
  isStreaming: boolean;
};

function parseSseFrames(buffer: string): { events: string[]; rest: string } {
  const events: string[] = [];
  let rest = buffer;
  let separatorIndex = rest.indexOf('\n\n');
  while (separatorIndex !== -1) {
    const frame = rest.slice(0, separatorIndex);
    rest = rest.slice(separatorIndex + 2);
    const dataLine = frame.split('\n').find(line => line.startsWith('data: '));
    if (dataLine) events.push(dataLine.slice('data: '.length));
    separatorIndex = rest.indexOf('\n\n');
  }
  return { events, rest };
}

export function ConciergeChat({
  aiBotName,
  phoneReception,
}: {
  aiBotName: string | null;
  phoneReception: string | null;
}) {
  const t = useTranslations('concierge');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);

  const botName = aiBotName ?? t('defaultBotName');

  async function sendMessage() {
    const question = input.trim();
    if (!question || isSending) return;

    const history: ConciergeTurn[] = messages
      .filter(message => !message.isFallback)
      .slice(-MAX_HISTORY_TURNS)
      .map(message => ({ role: message.role, content: message.content }));

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: question,
      isFallback: false,
      isStreaming: false,
    };
    const assistantId = crypto.randomUUID();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      isFallback: false,
      isStreaming: true,
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setInput('');
    setIsSending(true);

    function updateAssistant(update: Partial<ChatMessage>) {
      setMessages(prev =>
        prev.map(message => (message.id === assistantId ? { ...message, ...update } : message))
      );
    }

    try {
      const response = await fetch('/api/concierge/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, history }),
      });

      if (!response.ok || !response.body) {
        updateAssistant({ isFallback: true, isStreaming: false });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const { events, rest } = parseSseFrames(buffer);
        buffer = rest;

        for (const event of events) {
          const payload = JSON.parse(event) as { type: string; text?: string };
          if (payload.type === 'chunk' && payload.text) {
            accumulated += payload.text;
            updateAssistant({ content: accumulated });
          } else if (payload.type === 'error') {
            updateAssistant({ isFallback: true, isStreaming: false });
          } else if (payload.type === 'done') {
            updateAssistant({
              isFallback: accumulated.startsWith(FALLBACK_PREFIX),
              isStreaming: false,
            });
          }
        }
      }
    } catch {
      updateAssistant({ isFallback: true, isStreaming: false });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <p className="rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-600">
        {t('disclosure', { botName })}
      </p>

      <div className="flex-1 space-y-3 overflow-y-auto">
        {messages.map(message =>
          message.role === 'user' ? (
            <div key={message.id} className="ml-auto max-w-[85%] rounded-2xl bg-gray-900 px-4 py-2 text-white">
              {message.content}
            </div>
          ) : message.isFallback ? (
            <div key={message.id} className="max-w-[85%] rounded-2xl bg-amber-50 px-4 py-2 text-amber-900">
              <p>{t('fallbackMessage', { phone: phoneReception ?? '' })}</p>
              {phoneReception && (
                <a href={`tel:${phoneReception}`} className="mt-1 inline-block font-semibold underline">
                  {t('fallbackCta')}
                </a>
              )}
            </div>
          ) : (
            <div key={message.id} className="max-w-[85%] rounded-2xl bg-gray-100 px-4 py-2 text-gray-900">
              {message.content}
              {message.isStreaming && !message.content && (
                <span className="text-gray-400">{t('typing')}</span>
              )}
            </div>
          )
        )}
      </div>

      <form
        onSubmit={event => {
          event.preventDefault();
          void sendMessage();
        }}
        className="flex gap-2"
      >
        <input
          value={input}
          onChange={event => setInput(event.target.value)}
          placeholder={t('inputPlaceholder')}
          disabled={isSending}
          className="flex-1 rounded-full border px-4 py-2"
        />
        <button
          type="submit"
          disabled={isSending || !input.trim()}
          className="rounded-full bg-gray-900 px-5 py-2 font-semibold text-white disabled:opacity-50"
        >
          {t('send')}
        </button>
      </form>
    </div>
  );
}
