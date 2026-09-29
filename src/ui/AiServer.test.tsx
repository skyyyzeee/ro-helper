import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { analysisOf, isAnalysis } from '../test/fakeAi';
import { renderApp } from '../test/renderApp';
import { AI_SERVER } from './about';
import { DEVICE_SETTING, heard } from './ai';

interface Call {
  url: string;
  device: string | null;
  body: { system?: string; messages?: { role: string; content: string }[]; json?: boolean; counts?: boolean; audio?: string };
}

/** The AI server as the tests see it: the law terms, then the answer — or a refusal once the day's limit is out. */
function fakeServer(refuse?: string) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Call['body'];
      calls.push({ url, device: new Headers(init.headers).get('X-Device'), body });
      if (refuse && body.counts !== false) return new Response(JSON.stringify({ error: refuse }), { status: 429 });
      const text = isAnalysis(body.system ?? '') ? analysisOf(body.messages?.at(-1)?.content ?? '') : '["кража"]';
      return new Response(JSON.stringify({ text }), { status: 200 });
    }),
  );
  return calls;
}

async function ask(question: string) {
  const app = await renderApp();
  await app.user.click(screen.getByRole('button', { name: 'ИИ-разбор ситуации' }));
  await app.user.type(screen.getByRole('searchbox', { name: 'Поиск по законам' }), `${question}{Enter}`);
  return app;
}

describe('the AI through the AI server', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('answers with no key at all: the server holds it', async () => {
    const calls = fakeServer();
    const { platform } = await ask('у меня украли телефон');
    expect(await screen.findByText(/Это кража/)).toBeInTheDocument();

    expect(calls.every((c) => c.url === `${AI_SERVER}/v1/chat`)).toBe(true);
    // One computer, one id, kept for the limits; the law terms are a step, the answer is the question.
    const device = platform.settings.get(DEVICE_SETTING);
    expect(device).toMatch(/^d[0-9a-f]{32}$/);
    // Its own id, not the statistics' one: the AI server and the counts cannot be tied together.
    expect(device).not.toBe(platform.settings.get('device.id'));
    expect(calls.every((c) => c.device === device)).toBe(true);
    expect(calls.map((c) => c.body.counts)).toEqual([false, true]);
    // The found articles go along, in the messages the server passes on.
    expect(calls[1].body.messages?.at(-1)?.content).toMatch(/\[S\d+\] УК ст\. 65/);
  });

  it('says why when the day\'s questions are out', async () => {
    fakeServer('На сегодня вопросы ИИ закончились (20 в день).');
    await ask('у меня украли телефон');
    expect(await screen.findByRole('alert')).toHaveTextContent('На сегодня вопросы ИИ закончились (20 в день).');
  });

  it("takes the speech model's phantom credits on silence for nothing heard", () => {
    expect(heard('Редактор субтитров А.Синецкая Корректор А.Егорова')).toBe('');
    expect(heard('Продолжение следует...')).toBe('');
    expect(heard('Какое наказание за кражу телефона?')).toBe('Какое наказание за кражу телефона?');
  });

  it('says so when the server cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await ask('у меня украли телефон');
    expect(await screen.findByRole('alert')).toHaveTextContent('Нет связи с сервером ИИ');
  });
});
