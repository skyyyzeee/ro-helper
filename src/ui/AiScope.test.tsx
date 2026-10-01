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

  it('keeps the choice of laws or rules, and gives the AI only that kind of source', async () => {
    const { ask, user, platform, bodies } = await openAi();
    const choices = screen.getByRole('radiogroup', { name: 'Где искать ответ' });
    expect(within(choices).getByRole('radio', { name: 'Авто' })).toHaveAttribute('aria-checked', 'true');
    await user.click(within(choices).getByRole('radio', { name: 'Правила сервера' }));
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
