import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LegalAnswer } from '../protocol';
import { fakeGeminiFetch } from '../test/fakeAi';
import { renderApp } from '../test/renderApp';
import { AI_KEY_SETTING, AI_PROVIDER_SETTING } from './ai';

const GEMINI = { [AI_PROVIDER_SETTING]: 'gemini', [AI_KEY_SETTING]: 'test-key' };

async function ask(question: string, patch: Partial<LegalAnswer> = {}) {
  const bodies: string[] = [];
  vi.stubGlobal('fetch', vi.fn(fakeGeminiFetch(patch, bodies)));
  const app = await renderApp({ settings: GEMINI });
  await app.user.click(screen.getByRole('button', { name: 'ИИ-разбор ситуации' }));
  await app.user.type(screen.getByRole('searchbox', { name: 'Поиск по законам' }), `${question}{Enter}`);
  await screen.findByText('Применимые нормы');
  return { ...app, bodies };
}

describe('the analysis on screen', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lays the answer out in blocks, with the article as a card and the punishment from the laws and the calculator', async () => {
    await ask('у меня украли телефон');
    const reply = screen.getByRole('log');
    expect(within(reply).getByText('Подтверждено')).toBeInTheDocument();
    for (const block of ['Ситуация', 'Применимые нормы', 'Нарушение', 'Наказание', 'Процедура']) expect(within(reply).getByText(block)).toBeInTheDocument();
    expect(within(reply).getByText(/По базе:/).parentElement).toHaveTextContent(/штраф до 50\s000\s₽ либо 30\sмес/);
    expect(within(reply).getByText('Калькулятор:').parentElement).toHaveTextContent(/30\sмес/);
  });

  it('marks an answer citing an article the laws do not have as one to check, and never as confirmed', async () => {
    await ask('у меня украли телефон', {
      norms: [{ source: 'S99', ref: 'УК ст. 999', part: '1', why: 'выдумана', fit: 'direct', charge: true, stage: 'done' }],
    });
    const reply = screen.getByRole('log');
    expect(within(reply).getByText('Требует проверки')).toBeInTheDocument();
    expect(within(reply).queryByText('Подтверждено')).not.toBeInTheDocument();
    expect(within(reply).getByText(/УК ст\. 999: такой статьи нет в законах сервера/)).toBeInTheDocument();
    // Nothing unconfirmed reaches the calculator.
    expect(within(reply).queryByText('Калькулятор:')).not.toBeInTheDocument();
  });

  it('puts the found charges into the calculator with a press', async () => {
    const { user } = await ask('у меня украли телефон');
    await user.click(screen.getByRole('button', { name: 'Открыть в калькуляторе' }));
    expect(await screen.findByRole('complementary', { name: 'Калькулятор' })).toHaveTextContent(/65/);
  });

  it('asks the clarifying questions as buttons, and a press answers them', async () => {
    const { user, bodies } = await ask('у меня украли телефон', {
      questions: [{ question: 'Вор был сотрудником полиции?', options: ['Да', 'Нет'] }],
    });
    expect(screen.getByText('Уточните')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Нет' }));
    await vi.waitFor(() => expect(bodies.some((b) => b.includes('Вор был сотрудником полиции? — Нет'))).toBe(true));
    // The answer goes with the case so far, not as a new story.
    expect(bodies.at(-1)).toContain('ФАКТЫ ДЕЛА ДО ЭТОГО СООБЩЕНИЯ');
  });

  it('keeps the facts of the case in view', async () => {
    const { user } = await ask('у меня украли телефон');
    await user.click(screen.getByText(/Факты дела: 1/));
    expect(screen.getByText(/украли телефон/, { selector: 'li' })).toBeInTheDocument();
  });

  it('sends the full analysis with more thinking when it is chosen', async () => {
    vi.stubGlobal('fetch', vi.fn(fakeGeminiFetch()));
    const { platform, user } = await renderApp({ settings: GEMINI });
    await user.click(screen.getByRole('button', { name: 'ИИ-разбор ситуации' }));
    await user.click(screen.getByRole('radio', { name: 'Полный разбор' }));
    expect(platform.settings.get('ai.depth')).toBe('full');
  });

  it('when the AI fails, says search still works', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    const { user } = await renderApp({ settings: GEMINI });
    await user.click(screen.getByRole('button', { name: 'ИИ-разбор ситуации' }));
    await user.type(screen.getByRole('searchbox', { name: 'Поиск по законам' }), 'украли телефон{Enter}');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Нет связи с Gemini');
    expect(within(alert).getByRole('button', { name: 'поиск по законам' })).toBeInTheDocument();
  });
});
