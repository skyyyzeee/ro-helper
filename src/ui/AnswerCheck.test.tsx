import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeGeminiFetch } from '../test/fakeAi';
import { renderApp } from '../test/renderApp';
import { AI_KEY_SETTING, AI_PROVIDER_SETTING } from './ai';

const GEMINI = { [AI_PROVIDER_SETTING]: 'gemini', [AI_KEY_SETTING]: 'test-key' };
const reply = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });

describe('«Проверить мой ответ» (roadmap 6Б)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('weighs the player\'s answer point by point against the base: the verdicts, why, the articles, what to change', async () => {
    const gemini = fakeGeminiFetch();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        const body = String(init.body);
        if (!body.includes('ОТВЕТ ИГРОКА')) return gemini(url, init);
        // The check: the point on the theft article stands, the made-up one does not.
        const theft = body.match(/\[([SRCO]\d+)\] УК ст\. 65/)?.[1] ?? 'S1';
        return reply(
          JSON.stringify({
            points: [
              { point: 'это кража', verdict: 'matches', why: 'Тайное хищение чужого имущества — кража.', sources: [theft] },
              { point: 'дать 10 лет', verdict: 'matches', why: 'Так написано.', sources: [] },
            ],
            fix: 'Наказание сверить с калькулятором.',
          }),
        );
      }),
    );
    const { user } = await renderApp({ settings: GEMINI });
    await user.click(screen.getByRole('button', { name: 'ИИ-разбор ситуации' }));
    const field = () => screen.getByRole('searchbox', { name: 'Поиск по законам' });
    await user.type(field(), 'у меня украли телефон{Enter}');
    await screen.findByText('Применимые нормы');

    await user.click(screen.getByRole('button', { name: 'Проверить мой ответ' }));
    expect(field()).toHaveAttribute('placeholder', 'Ваш ответ: что бы вы сделали и почему…');
    await user.type(field(), 'Это кража, дам ему 10 лет{Enter}');

    const check = await screen.findByLabelText('Проверка ответа');
    // A point with no source is not confirmed: the answer as a whole is only partly right — the app's word.
    expect(check).toHaveTextContent('Частично верно');
    const [theft, made] = within(check).getAllByRole('listitem');
    expect(theft).toHaveTextContent('Соответствует');
    expect(within(theft).getByRole('button', { name: /УК ст\. 65/ })).toBeInTheDocument();
    expect(made).toHaveTextContent('Не подтверждено');
    expect(check).toHaveTextContent('Что изменить: Наказание сверить с калькулятором.');
    expect(screen.getByText('Мой ответ')).toBeInTheDocument();
    // Back to questions after one answer.
    expect(field()).not.toHaveAttribute('placeholder', 'Ваш ответ: что бы вы сделали и почему…');
  });
});
