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

  it('renders the escalation bubble (not the fallback bubble) for [ESCALATE]-prefixed text', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: sseStream([
        JSON.stringify({ type: 'chunk', text: '[ESCALATE] Reklamacja gościa.' }),
        JSON.stringify({ type: 'done' }),
      ]),
    }) as unknown as typeof fetch

    renderChat()
    await sendQuestion('Mam reklamację, brudny pokój')

    await waitFor(() =>
      expect(
        screen.getByText('Ta sprawa wymaga uwagi recepcji. Łączymy Cię bezpośrednio: +48123456789')
      ).toBeTruthy()
    )
    expect(
      screen.queryByText('Nie mam odpowiedzi na to pytanie. Skontaktuj się z recepcją: +48123456789')
    ).toBeNull()
  })

  it('escalates exactly on the 3rd consecutive fallback, not before', async () => {
    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        body: sseStream([
          JSON.stringify({ type: 'chunk', text: '[FALLBACK] Nie znam odpowiedzi.' }),
          JSON.stringify({ type: 'done' }),
        ]),
      })
    ) as unknown as typeof fetch

    renderChat()

    await sendQuestion('Pytanie 1')
    await waitFor(() =>
      expect(
        screen.getAllByText('Nie mam odpowiedzi na to pytanie. Skontaktuj się z recepcją: +48123456789')
          .length
      ).toBe(1)
    )

    await sendQuestion('Pytanie 2')
    await waitFor(() =>
      expect(
        screen.getAllByText('Nie mam odpowiedzi na to pytanie. Skontaktuj się z recepcją: +48123456789')
          .length
      ).toBe(2)
    )
    expect(
      screen.queryByText('Ta sprawa wymaga uwagi recepcji. Łączymy Cię bezpośrednio: +48123456789')
    ).toBeNull()

    await sendQuestion('Pytanie 3')
    await waitFor(() =>
      expect(
        screen.getByText('Ta sprawa wymaga uwagi recepcji. Łączymy Cię bezpośrednio: +48123456789')
      ).toBeTruthy()
    )
    expect(
      screen.getAllByText('Nie mam odpowiedzi na to pytanie. Skontaktuj się z recepcją: +48123456789')
        .length
    ).toBe(2)
  })

  it('resets the fallback streak on a normal answer in between', async () => {
    const fetchMock = vi.fn()
    global.fetch = fetchMock as unknown as typeof fetch

    const fallbackResponse = {
      ok: true,
      body: sseStream([
        JSON.stringify({ type: 'chunk', text: '[FALLBACK] Nie znam odpowiedzi.' }),
        JSON.stringify({ type: 'done' }),
      ]),
    }
    const normalResponse = {
      ok: true,
      body: sseStream([
        JSON.stringify({ type: 'chunk', text: 'Śniadanie od 7 do 10.' }),
        JSON.stringify({ type: 'done' }),
      ]),
    }

    fetchMock
      .mockResolvedValueOnce(fallbackResponse)
      .mockResolvedValueOnce(fallbackResponse)
      .mockResolvedValueOnce(normalResponse)
      .mockResolvedValueOnce(fallbackResponse)
      .mockResolvedValueOnce(fallbackResponse)

    renderChat()

    await sendQuestion('Pytanie 1')
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await sendQuestion('Pytanie 2')
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    await sendQuestion('Pytanie 3')
    await waitFor(() => expect(screen.getByText('Śniadanie od 7 do 10.')).toBeTruthy())
    await sendQuestion('Pytanie 4')
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4))
    await sendQuestion('Pytanie 5')
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5))

    expect(
      screen.queryByText('Ta sprawa wymaga uwagi recepcji. Łączymy Cię bezpośrednio: +48123456789')
    ).toBeNull()
  })

  it('shows Quick Reply chips when the chat is empty and hides them after the first message', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: sseStream([
        JSON.stringify({ type: 'chunk', text: 'Śniadanie od 7 do 10.' }),
        JSON.stringify({ type: 'done' }),
      ]),
    }) as unknown as typeof fetch

    renderChat()

    expect(screen.getByText('Śniadanie — godziny?')).toBeTruthy()

    fireEvent.click(screen.getByText('Jest WiFi?'))

    await waitFor(() => expect(screen.getByText('Jest WiFi?', { selector: 'div' })).toBeTruthy())
    expect(screen.queryByText('Śniadanie — godziny?')).toBeNull()
  })
})
