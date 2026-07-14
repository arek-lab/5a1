'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ConciergeTurn } from '@/lib/concierge/payload';

const MAX_HISTORY_TURNS = 10;
const FALLBACK_PREFIX = '[FALLBACK]';
const ESCALATE_PREFIX = '[ESCALATE]';
const ESCALATION_STREAK_THRESHOLD = 3;
const QUICK_REPLY_KEYS = ['breakfast', 'wifi', 'parking', 'checkout', 'pets', 'area'] as const;

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isFallback: boolean;
  isEscalated: boolean;
  isStreaming: boolean;
};

function reportEscalation() {
  void fetch('/api/concierge/escalate', { method: 'POST' }).catch(() => {});
}

function ConciergeAvatar() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-8 w-8 shrink-0 rounded-full bg-guest-accent/15 p-1.5 text-guest-accent"
    >
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
    </svg>
  );
}

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
  const consecutiveFallbackCount = useRef(0);

  const botName = aiBotName ?? t('defaultBotName');

  async function sendMessage(overrideQuestion?: string) {
    const question = (overrideQuestion ?? input).trim();
    if (!question || isSending) return;

    const history: ConciergeTurn[] = messages
      .filter(message => !message.isFallback && !message.isEscalated)
      .slice(-MAX_HISTORY_TURNS)
      .map(message => ({ role: message.role, content: message.content }));

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: question,
      isFallback: false,
      isEscalated: false,
      isStreaming: false,
    };
    const assistantId = crypto.randomUUID();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      isFallback: false,
      isEscalated: false,
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
        consecutiveFallbackCount.current += 1;
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
            consecutiveFallbackCount.current += 1;
            updateAssistant({ isFallback: true, isStreaming: false });
          } else if (payload.type === 'done') {
            if (accumulated.startsWith(ESCALATE_PREFIX)) {
              consecutiveFallbackCount.current = 0;
              reportEscalation();
              updateAssistant({ isEscalated: true, isStreaming: false });
            } else if (accumulated.startsWith(FALLBACK_PREFIX)) {
              consecutiveFallbackCount.current += 1;
              if (consecutiveFallbackCount.current >= ESCALATION_STREAK_THRESHOLD) {
                consecutiveFallbackCount.current = 0;
                reportEscalation();
                updateAssistant({ isEscalated: true, isStreaming: false });
              } else {
                updateAssistant({ isFallback: true, isStreaming: false });
              }
            } else {
              consecutiveFallbackCount.current = 0;
              updateAssistant({ isStreaming: false });
            }
          }
        }
      }
    } catch {
      consecutiveFallbackCount.current += 1;
      updateAssistant({ isFallback: true, isStreaming: false });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <p className="shrink-0 rounded-card bg-guest-stone px-3 py-2 text-sm text-guest-ink-muted">
        {t('disclosure', { botName })}
      </p>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        {messages.map(message =>
          message.role === 'user' ? (
            <div key={message.id} className="ml-auto max-w-[85%] rounded-card bg-guest-accent px-4 py-2 text-white">
              {message.content}
            </div>
          ) : message.isEscalated ? (
            <div key={message.id} className="flex max-w-[85%] gap-2">
              <ConciergeAvatar />
              <div className="rounded-card bg-red-50 px-4 py-2 text-red-900">
                <p>{t('escalationMessage', { phone: phoneReception ?? '' })}</p>
                {phoneReception && (
                  <a href={`tel:${phoneReception}`} className="mt-1 inline-block font-semibold underline">
                    {t('escalationCta')}
                  </a>
                )}
              </div>
            </div>
          ) : message.isFallback ? (
            <div key={message.id} className="flex max-w-[85%] gap-2">
              <ConciergeAvatar />
              <div className="rounded-card bg-amber-50 px-4 py-2 text-amber-900">
                <p>{t('fallbackMessage', { phone: phoneReception ?? '' })}</p>
                {phoneReception && (
                  <a href={`tel:${phoneReception}`} className="mt-1 inline-block font-semibold underline">
                    {t('fallbackCta')}
                  </a>
                )}
              </div>
            </div>
          ) : (
            <div key={message.id} className="flex max-w-[85%] gap-2">
              <ConciergeAvatar />
              <div className="rounded-card border border-guest-ink-muted/15 bg-guest-paper px-4 py-2 text-guest-ink shadow-soft">
                {message.content}
                {message.isStreaming && !message.content && (
                  <span className="text-guest-ink-muted">{t('typing')}</span>
                )}
              </div>
            </div>
          )
        )}
      </div>

      {messages.length === 0 && (
        <div className="flex shrink-0 flex-wrap gap-2">
          {QUICK_REPLY_KEYS.map(key => (
            <button
              key={key}
              type="button"
              onClick={() => void sendMessage(t(`chips.${key}`))}
              className="rounded-pill border border-guest-ink-muted/30 px-3 py-1 text-sm text-guest-ink-muted hover:bg-guest-stone"
            >
              {t(`chips.${key}`)}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={event => {
          event.preventDefault();
          void sendMessage();
        }}
        className="flex shrink-0 gap-2"
      >
        <input
          value={input}
          onChange={event => setInput(event.target.value)}
          placeholder={t('inputPlaceholder')}
          disabled={isSending}
          className="flex-1 rounded-pill border border-guest-ink-muted/30 bg-guest-paper px-4 py-2 text-guest-ink"
        />
        <button
          type="submit"
          disabled={isSending || !input.trim()}
          className="rounded-pill bg-guest-accent px-5 py-2 font-semibold text-white disabled:opacity-50"
        >
          {t('send')}
        </button>
      </form>
    </div>
  );
}
