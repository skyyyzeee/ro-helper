import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeGeminiFetch } from '../test/fakeAi';
import { renderApp } from '../test/renderApp';
import { AI_KEY_SETTING, AI_PROVIDER_SETTING } from './ai';

const GEMINI = { [AI_PROVIDER_SETTING]: 'gemini', [AI_KEY_SETTING]: 'test-key' };

/** Gemini answers the questions; the AI server takes the marks — each kept to look at. */
async function answered(feedback: { status: number; body: unknown } = { status: 200, body: { ok: true } }) {
  const gemini = fakeGeminiFetch();
  const marks: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      if (String(url).endsWith('/v1/feedback')) {
        marks.push({ url: String(url), headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
        return new Response(JSON.stringify(feedback.body), { status: feedback.status });
      }
      return gemini(url, init);
    }),
  );
  const app = await renderApp({ settings: GEMINI });
  await app.user.click(screen.getByRole('button', { name: 'ИИ-разбор ситуации' }));
  await app.user.type(screen.getByRole('searchbox', { name: 'Поиск по законам' }), 'у меня украли телефон{Enter}');
  await screen.findByText('Применимые нормы');
  return { ...app, marks, bar: () => screen.getByLabelText('Оценить ответ') };
}

describe('marking an answer', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends 👍 with the question and the answer\'s articles, once — and says thanks', async () => {
    const { user, marks, bar } = await answered();
    await user.click(within(bar()).getByRole('button', { name: 'Ответ верный' }));
    expect(await screen.findByText('Спасибо за оценку!')).toBeInTheDocument();
    expect(marks).toHaveLength(1);
    expect(marks[0].body).toMatchObject({ vote: 'up', question: 'у меня украли телефон', server: 'tverskoi', scope: 'law', status: 'confirmed' });
    expect(marks[0].body.norms).toEqual(['УК 65']);
    expect(screen.queryByLabelText('Оценить ответ')).not.toBeInTheDocument();
  });

  it('«Исправить» sends the player\'s words with 👎; nothing about the player is in the mark', async () => {
    const { user, marks, bar } = await answered();
    await user.click(within(bar()).getByRole('button', { name: 'Исправить' }));
    await user.type(screen.getByLabelText(/Как правильно/), 'это грабёж, ст. 66');
    await user.click(screen.getByRole('button', { name: 'Отправить' }));
    expect(await screen.findByText(/Спасибо — разберёмся/)).toBeInTheDocument();
    expect(marks[0].body).toMatchObject({ vote: 'down', correction: 'это грабёж, ст. 66' });
    // The computer's id goes in the header for the daily limit only, never in the mark itself.
    expect(Object.keys(marks[0].body).sort()).toEqual(['app', 'correction', 'norms', 'question', 'scope', 'server', 'status', 'vote']);
  });

  it('says why when the server would not take it, and lets the player try again', async () => {
    const { user, marks, bar } = await answered({ status: 429, body: { error: 'На сегодня отзывов достаточно — спасибо! Завтра можно снова.' } });
    await user.click(within(bar()).getByRole('button', { name: 'Ответ неверный' }));
    expect(await within(bar()).findByRole('alert')).toHaveTextContent('На сегодня отзывов достаточно');
    expect(within(bar()).getByRole('button', { name: 'Ответ верный' })).toBeEnabled();
    expect(marks).toHaveLength(1);
  });
});
