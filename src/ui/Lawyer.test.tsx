import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/renderApp';
import { AI_SERVER_SETTING } from './ai';
import { spoken } from './lawyer';

const SERVER = { [AI_SERVER_SETTING]: 'https://ai.example' };

const ANSWER = {
  demands: [
    { demand: 'Свидание с задержанным наедине', verdict: 'lawful', basis: 'УК ст. 65 — пример основания', officer: 'Предоставить свидание наедине до допроса.', refusal: '' },
    { demand: 'Отпустить задержанного через 30 минут', verdict: 'unlawful', basis: 'УК ст. 65 — пример основания', officer: 'Продолжить задержание в пределах срока.', refusal: 'Срок задержания ещё не истёк — УК ст. 65' },
  ],
  reply: 'Свидание наедине я предоставлю. Отпустить задержанного сейчас не могу: срок задержания не истёк.',
  note: 'Первое требование законно — его нужно выполнить.',
};

/** The AI server: the law terms, then the weighing of the demands; every request kept. */
function fakeServer() {
  const bodies: { system?: string; messages?: { content: string }[]; json?: boolean; counts?: boolean; think?: boolean }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as (typeof bodies)[number];
      bodies.push(body);
      // The answer cites the first article the search really found, as the AI would.
      const found = body.messages?.at(-1)?.content.match(/### (\S+ (?:ст|п)\. [\d.]+)/)?.[1] ?? 'нет';
      const text = body.counts === false ? '["права защитника", "свидание с задержанным"]' : JSON.stringify(ANSWER).replaceAll('УК ст. 65', found);
      return new Response(JSON.stringify({ text }), { status: 200 });
    }),
  );
  return bodies;
}

describe('the lawyer\'s demands', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('weighs each demand without taking the officer\'s side, and gives a reply to copy', async () => {
    const bodies = fakeServer();
    const { platform, user } = await renderApp({ settings: SERVER });
    await user.click(screen.getByRole('button', { name: 'ИИ-разбор ситуации' }));
    await user.click(screen.getByRole('radio', { name: 'Требования адвоката' }));
    const view = screen.getByRole('region', { name: 'Требования адвоката' });
    await user.type(screen.getByRole('searchbox', { name: 'Поиск по законам' }), 'свидание наедине и отпустить через 30 минут{Enter}');

    const demands = await within(view).findAllByRole('listitem');
    expect(demands).toHaveLength(2);
    // A lawful demand is said to be one, with what the officer must do — and no ground to refuse.
    expect(demands[0]).toHaveTextContent('Законно — нужно выполнить');
    expect(demands[0]).toHaveTextContent('Предоставить свидание наедине до допроса.');
    expect(demands[0]).not.toHaveTextContent('Можно отказать');
    expect(demands[1]).toHaveTextContent('Незаконно — можно отказать');
    // Its basis is a found article of the server's laws, opened with a click.
    expect(within(demands[1]).getAllByRole('button', { name: /(ст|п)\. [\d.]+/ }).length).toBeGreaterThan(0);
    expect(within(view).getByText('Первое требование законно — его нужно выполнить.')).toBeInTheDocument();

    await user.click(within(view).getByRole('button', { name: 'Скопировать ответ' }));
    expect(platform.state.clipboard).toMatch(/^Свидание наедине я предоставлю/);

    // The AI was told to take no side, and given the server's articles.
    const asked = bodies.find((b) => b.counts !== false)!;
    expect(asked.system).toMatch(/БУДЬ БЕСПРИСТРАСТЕН/);
    expect(asked.system).toMatch(/ОБЯЗАН сделать/);
    expect(asked.think).toBe(true);
    expect(asked.messages?.at(-1)?.content).toMatch(/### .+ ст\. /);
  });

  it('gives the reply as it is said, without a lead-in', () => {
    expect(spoken('Сотрудник адвокату от первого лица: Копию выдам.')).toBe('Копию выдам.');
    expect(spoken('«Копию выдам.»')).toBe('Копию выдам.');
    expect(spoken('Сотрудник: согласно УПК ст. 54 копию выдам.')).toBe('Согласно УПК ст. 54 копию выдам.');
    expect(spoken('Копию выдам: по УПК ст. 54.')).toBe('Копию выдам: по УПК ст. 54.');
  });

  it('offers an example to try the first time', async () => {
    fakeServer();
    const { user } = await renderApp({ settings: SERVER });
    await user.click(screen.getByRole('button', { name: 'ИИ-разбор ситуации' }));
    await user.click(screen.getByRole('radio', { name: 'Требования адвоката' }));
    const view = screen.getByRole('region', { name: 'Требования адвоката' });
    await user.click(within(within(view).getByLabelText('Пример')).getByRole('button'));
    expect(await within(view).findAllByRole('listitem')).toHaveLength(2);
  });
});
