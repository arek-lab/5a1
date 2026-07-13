// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { ConciergeChat } from '../concierge-chat'
import messages from '@/messages/pl.json'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.resetAllMocks()
})

function renderChat() {
  return render(
    <NextIntlClientProvider locale="pl" messages={messages}>
      <ConciergeChat aiBotName="Hela" phoneReception="+48123456789" />
    </NextIntlClientProvider>
  )
}

function sseStream(frames: string[]) {
  const encoder = new TextEncoder()
  let index = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < frames.length) {
        controller.enqueue(encoder.encode(`data: ${frames[index]}\n\n`))
        index += 1
      } else {
        controller.close()
      }
    },
  })
}

async function sendQuestion(text: string) {
  fireEvent.change(screen.getByPlaceholderText('Zadaj pytanie...'), { target: { value: text } })
  fireEvent.click(screen.getByText('Wyślij'))
}

describe('ConciergeChat', () => {
  it('appends progressive chunks to the visible message instead of replacing it', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: sseStream([
        JSON.stringify({ type: 'chunk', text: 'Cześć' }),
        JSON.stringify({ type: 'chunk', text: ', jak mogę pomóc?' }),
        JSON.stringify({ type: 'done' }),
      ]),
    }) as unknown as typeof fetch

    renderChat()
    await sendQuestion('Jakie są godziny śniadania?')

    await waitFor(() => expect(screen.getByText('Cześć, jak mogę pomóc?')).toBeTruthy())
  })

  it('renders the fallback bubble when accumulated text is [FALLBACK]-prefixed', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: sseStream([
        JSON.stringify({ type: 'chunk', text: '[FALLBACK] Nie znam odpowiedzi.' }),
        JSON.stringify({ type: 'done' }),
      ]),
    }) as unknown as typeof fetch

    renderChat()
    await sendQuestion('Czy hotel ma helipad?')

    await waitFor(() =>
      expect(
        screen.getByText('Nie mam odpowiedzi na to pytanie. Skontaktuj się z recepcją: +48123456789')
      ).toBeTruthy()
    )
    expect(screen.queryByText('[FALLBACK] Nie znam odpowiedzi.')).toBeNull()
  })

  it('renders the fallback bubble on an error frame', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: sseStream([JSON.stringify({ type: 'error', fallback: true })]),
    }) as unknown as typeof fetch

    renderChat()
    await sendQuestion('Czy jest parking?')

    await waitFor(() =>
      expect(
        screen.getByText('Nie mam odpowiedzi na to pytanie. Skontaktuj się z recepcją: +48123456789')
      ).toBeTruthy()
    )
  })
})
