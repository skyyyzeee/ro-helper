import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeGeminiFetch } from '../test/fakeAi';
import { renderApp } from '../test/renderApp';
import { AI_KEY_SETTING, AI_PROVIDER_SETTING, SCOPE_SETTING } from './ai';

const GEMINI = { [AI_PROVIDER_SETTING]: 'gemini', [AI_KEY_SETTING]: 'test-key' };

async function openAi(settings: Record<string, unknown> = {}) {
  const bodies: string[] = [];
  const fetch = vi.fn(fakeGeminiFetch({}, bodies));
  vi.stubGlobal('fetch', fetch);
  const app = await renderApp({ settings: { ...GEMINI, ...settings } });
  await app.user.click(screen.getByRole('button', { name: 'ИИ-разбор ситуации' }));
  const ask = (text: string) => app.user.type(screen.getByRole('searchbox', { name: 'Поиск по законам' }), `${text}{Enter}`);
  return { ...app, ask, fetch, bodies };
}

describe('the AI as a closed layer over the base', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('answers a greeting itself, asking the AI nothing', async () => {
    const { ask, fetch } = await openAi();
    await ask('привет');
    expect(await within(screen.getByRole('log')).findByText(/Я работаю с законами, правилами и документами/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('says it does not use the real laws of Russia, asking the AI nothing', async () => {
    const { ask, fetch } = await openAi();
    await ask('по реальному УК РФ это кража?');
    expect(await within(screen.getByRole('log')).findByText(/Я не использую реальные законы РФ/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('opens an article named by its number, with no AI', async () => {
    const { ask, fetch, user } = await openAi();
    await ask('ук 65');
    const found = await within(screen.getByRole('log')).findByRole('button', { name: /^УК ст\. 65 Кража/ });
    expect(fetch).not.toHaveBeenCalled();
    await user.click(found);
    expect(await screen.findByRole('heading', { name: /Кража/ })).toBeInTheDocument();
  });

  it('tells what a deed is punished with from the base, with no AI, and asks the AI only when asked to', async () => {
    const { ask, fetch, user } = await openAi();
    await ask('Что будет за кражу?');
    const log = screen.getByRole('log');
    const article = await within(log).findByRole('button', { name: /^УК ст. 65 Кража/ });
    expect(article.textContent).toMatch(/штраф|лишение свободы|мес/i);
    expect(within(log).getByText(/ответ из базы, без ИИ/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();

    await user.click(within(log).getByRole('button', { name: /Разобрать с ИИ/ }));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
  });

  it('offers the laws when a question of the laws was asked in the rules, and asks it there at a click', async () => {
    const { ask, user, bodies } = await openAi({ [SCOPE_SETTING]: 'server_rule' });
    await ask('при задержании хочу зачитать миранду, что зачитывать?');
    const note = await within(screen.getByRole('log')).findByRole('note');
    expect(note).toHaveTextContent(/похож на вопрос о законах/);
    const before = bodies.length;
    await user.click(within(note).getByRole('button', { name: 'Разобрать по законам' }));
    await vi.waitFor(() => expect(bodies.slice(before).some((b) => b.includes('ОБЛАСТЬ ВОПРОСА — ЗАКОНЫ') || b.includes('НАЙДЕННЫЕ ИСТОЧНИКИ'))).toBe(true));
  });

  it('keeps the choice of laws or rules, and gives the AI only that kind of source', async () => {
    const { ask, user, platform, bodies } = await openAi();
    // A small choice inside the field at the bottom, «Законы и правила» first.
    const choice = screen.getByRole('combobox', { name: 'Где искать ответ' });
    expect(choice).toHaveTextContent('Законы и правила');
    await user.click(choice);
    await user.click(screen.getByRole('option', { name: 'Только правила сервера' }));
    expect(choice).toHaveTextContent('Только правила сервера');
    expect(platform.settings.get(SCOPE_SETTING)).toBe('server_rule');

    await ask('оскорбил родных игрока в голосовом чате');
    await screen.findByText(/Применимые правила сервера|Не найдено/);
    const analysis = bodies.map((b) => b).find((b) => b.includes('НАЙДЕННЫЕ ИСТОЧНИКИ'))!;
    expect(analysis).toContain('ПРАВИЛА СЕРВЕРА');
    expect(analysis).not.toMatch(/\[S\d+\]/);
    expect(analysis).toContain('ОБЛАСТЬ ВОПРОСА — ПРАВИЛА СЕРВЕРА');
  });

  it('marks each norm with its kind', async () => {
    const { ask } = await openAi();
    await ask('у меня украли телефон');
    await screen.findByText('Применимые нормы');
    expect(within(screen.getByRole('log')).getAllByText('Закон').length).toBeGreaterThan(0);
  });
});
