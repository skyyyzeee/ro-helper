import { act, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analysisOf, fakeGeminiFetch, isAnalysis } from '../test/fakeAi';
import { pinnedCards, renderApp } from '../test/renderApp';
import { AI_KEY_SETTING, AI_PROVIDER_SETTING, historyKey, type StoredConversation } from './ai';
import { DEFAULT_VOICE_HOTKEY, VOICE_HOTKEY_KEY } from './overlaySettings';

/** These tests talk to Gemini with a key, the way a player outside Russia may. */
const GEMINI = { [AI_PROVIDER_SETTING]: 'gemini', [AI_KEY_SETTING]: 'test-key' };

// The microphone as the tests see it: always there, a second of silence recorded.
vi.mock('./voice', async (original) => ({
  ...(await original<typeof import('./voice')>()),
  canRecord: () => true,
  startRecording: vi.fn(async () => ({ stop: async () => ({ chunks: [new Float32Array(16000)], sampleRate: 16000 }), cancel: () => {} })),
}));
// Speech on the computer itself (Vosk), for the players on the AI server: it hears the question at once.
vi.mock('./localSpeech', () => ({ recognize: vi.fn(async () => 'Какое наказание за кражу') }));

/** Gemini: writes down the recording, gives the law terms, then the analysis. */
function fakeGemini() {
  const bodies: string[] = [];
  vi.stubGlobal('fetch', vi.fn(fakeGeminiFetch({}, bodies)));
  return bodies;
}

const wait = (ms: number) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));
/** Speaking with the key held down: longer than a tap and than the shortest question. */
const speak = () => wait(900);

describe('a question over the game', () => {
  beforeEach(() => void fakeGemini());
  afterEach(() => vi.unstubAllGlobals());

  it('listens while the key is held, then pins the short answer over the game and keeps it in the history', async () => {
    const { platform } = await renderApp({ settings: GEMINI });
    await vi.waitFor(() => expect(platform.state.voiceHotkey).toBe(DEFAULT_VOICE_HOTKEY));

    await act(async () => platform.holdVoiceHotkey());
    await vi.waitFor(() => expect(platform.state.toast?.title).toBe('Слушаю…'));
    await speak();
    await act(async () => platform.releaseVoiceHotkey());

    await vi.waitFor(() => expect(pinnedCards(platform).some((card) => card.kind === 'ai')).toBe(true));
    const card = pinnedCards(platform).find((c) => c.kind === 'ai')!;
    expect(card.heading).toBe('у меня украли телефон');
    // The article's punishment comes from the laws and the total from the calculator, not from the AI's words.
    expect(card.lines[0]).toBe('Суть: Это кража телефона.');
    expect(card.lines[1]).toMatch(/^УК ст\. 65 ч\. 1 — штраф до 50\s000\s₽ либо 30\sмес$/);
    expect(card.lines.some((line) => /^Итог: 30\sмес/.test(line))).toBe(true);
    expect(card.lines.at(-1)).toBe('Что делать: заявить в полицию');
    const saved = platform.settings.get(historyKey('tverskoi')) as StoredConversation[];
    expect(saved[0].title).toBe('у меня украли телефон');
  });

  it('also takes a tap to start and another press to end, when the key is not held', async () => {
    const { platform } = await renderApp({ settings: GEMINI });
    await vi.waitFor(() => expect(platform.state.voiceHotkey).toBe(DEFAULT_VOICE_HOTKEY));
    await act(async () => platform.holdVoiceHotkey());
    await vi.waitFor(() => expect(platform.state.toast?.title).toBe('Слушаю…'));
    await act(async () => platform.releaseVoiceHotkey());
    expect(platform.state.toast?.text).toMatch(/нажмите Alt \+ W ещё раз/);
    expect(pinnedCards(platform)).toEqual([]);

    await speak();
    await act(async () => platform.holdVoiceHotkey());
    await vi.waitFor(() => expect(pinnedCards(platform).some((card) => card.kind === 'ai')).toBe(true));
  });

  it('keeps listening while Windows repeats the held key, «let go» between the repeats and all, and asks once they stop', async () => {
    const { platform } = await renderApp({ settings: GEMINI });
    await vi.waitFor(() => expect(platform.state.voiceHotkey).toBe(DEFAULT_VOICE_HOTKEY));
    await act(async () => platform.holdVoiceHotkey());
    await vi.waitFor(() => expect(platform.state.toast?.title).toBe('Слушаю…'));
    for (let i = 0; i < 20; i++) {
      await wait(50);
      await act(async () => platform.releaseVoiceHotkey());
      await act(async () => platform.holdVoiceHotkey());
    }
    // Still listening while the key repeats: nothing asked yet.
    expect(platform.state.toast?.title).toBe('Слушаю…');
    expect(pinnedCards(platform)).toEqual([]);
    await vi.waitFor(() => expect(pinnedCards(platform).some((card) => card.kind === 'ai')).toBe(true), { timeout: 3000 });
  });

  it('does not send a recording too short to hold a question', async () => {
    const { platform } = await renderApp({ settings: GEMINI });
    await vi.waitFor(() => expect(platform.state.voiceHotkey).toBe(DEFAULT_VOICE_HOTKEY));
    await act(async () => platform.holdVoiceHotkey());
    await vi.waitFor(() => expect(platform.state.toast?.title).toBe('Слушаю…'));
    await act(async () => platform.releaseVoiceHotkey());
    await wait(300);
    await act(async () => platform.holdVoiceHotkey());
    await vi.waitFor(() => expect(platform.state.toast?.title).toBe('Слишком коротко'));
    expect(pinnedCards(platform)).toEqual([]);
  });

  it('asks the AI for a short answer, fit for a card', async () => {
    const { platform } = await renderApp({ settings: GEMINI });
    await vi.waitFor(() => expect(platform.state.voiceHotkey).toBe(DEFAULT_VOICE_HOTKEY));
    const bodies = fakeGemini();
    await act(async () => platform.holdVoiceHotkey());
    await vi.waitFor(() => expect(platform.state.toast?.title).toBe('Слушаю…'));
    await speak();
    await act(async () => platform.releaseVoiceHotkey());
    await vi.waitFor(() => expect(bodies.some((b) => b.includes('РЕЖИМ — БЫСТРЫЙ РАЗБОР'))).toBe(true));
  });

  it('says so over the game when the AI cannot answer', async () => {
    const { platform } = await renderApp({ settings: { [AI_PROVIDER_SETTING]: 'gemini' } });
    await vi.waitFor(() => expect(platform.state.voiceHotkey).toBe(DEFAULT_VOICE_HOTKEY));
    await act(async () => platform.holdVoiceHotkey());
    await vi.waitFor(() => expect(platform.state.toast?.title).toBe('Слушаю…'));
    await speak();
    await act(async () => platform.releaseVoiceHotkey());
    await vi.waitFor(() => expect(platform.state.toast?.text).toMatch(/ключ Gemini/));
    expect(pinnedCards(platform)).toEqual([]);
  });

  it('recognises the speech on the computer itself with the AI server: only the question goes online', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push(url);
        const body = JSON.parse(String(init.body)) as { system: string; messages: { content: string }[] };
        const text = isAnalysis(body.system) ? analysisOf(body.messages.at(-1)!.content) : '["кража"]';
        return new Response(JSON.stringify({ text }), { status: 200 });
      }),
    );
    const { platform } = await renderApp();
    await vi.waitFor(() => expect(platform.state.voiceHotkey).toBe(DEFAULT_VOICE_HOTKEY));
    await act(async () => platform.holdVoiceHotkey());
    await vi.waitFor(() => expect(platform.state.toast?.title).toBe('Слушаю…'));
    await speak();
    await act(async () => platform.releaseVoiceHotkey());
    await vi.waitFor(() => expect(pinnedCards(platform).find((card) => card.kind === 'ai')?.heading).toBe('Какое наказание за кражу'));
    // No paid speech service: the recording never left the computer.
    expect(calls.some((url) => url.includes('/v1/transcribe'))).toBe(false);
    expect(calls.every((url) => url.endsWith('/v1/chat'))).toBe(true);
  });

  it('is turned off, or given another key, in the settings', async () => {
    const { platform, user } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    const settings = screen.getByRole('group', { name: 'Настройки' });
    const toggle = within(settings).getByRole('switch', { name: 'Спрашивать, не открывая окно' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    await user.click(toggle);
    expect(platform.settings.get(VOICE_HOTKEY_KEY)).toBe('');
    await vi.waitFor(() => expect(platform.state.voiceHotkey).toBeNull());
  });
});
