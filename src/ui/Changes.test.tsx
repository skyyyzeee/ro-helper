import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/renderApp';

// The bundled pack has no changes yet: give it one update against a made-up earlier version —
// УК ст. 65 reworded, ст. 113 new, a ст. 999 that is gone.
vi.mock('../data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data')>();
  const { TVERSKOI_PACK } = actual;
  const { diffPacks } = await import('../core/changes');
  const earlier = structuredClone(TVERSKOI_PACK);
  const uk = earlier.documents.find((d) => d.id === 'uk')!;
  const theft = uk.articles.find((a) => a.id === 'uk-65')!;
  theft.parts[0].text = 'Кража, то есть скрытое хищение имущества';
  uk.articles = uk.articles.filter((a) => a.id !== 'uk-113');
  uk.articles.push({ ...structuredClone(theft), id: 'uk-999', number: '999', title: 'Отменённое преступление' });
  const changes = [{ version: TVERSKOI_PACK.version, documents: diffPacks(earlier, TVERSKOI_PACK) }];
  const pack = { ...TVERSKOI_PACK, changes };
  return { ...actual, TVERSKOI_PACK: pack, PACKS: { ...actual.PACKS, tverskoi: pack }, packFor: () => pack };
});

const SEEN = 'laws.seen:tverskoi';
const VERSION = '2026-09-11T12:14:23+03:00';
const search = () => screen.getByRole('searchbox', { name: 'Поиск по законам' });
const changesScreen = () => screen.queryByRole('region', { name: 'Что изменилось' });

beforeEach(() => {
  // Three days after the update: still «recent».
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-14T12:00:00+03:00'));
});
afterEach(() => vi.useRealTimers());

describe('«Что изменилось»', () => {
  it('does not show on the first launch, which has nothing to compare with', async () => {
    const { platform } = await renderApp();
    await vi.waitFor(() => expect(platform.settings.get(SEEN)).toBe(VERSION));
    expect(changesScreen()).not.toBeInTheDocument();
  });

  it('shows once after the laws were updated: what changed, by document, with the date', async () => {
    const { platform } = await renderApp({ settings: { [SEEN]: '2026-09-01T10:00:00+03:00' } });
    const view = await screen.findByRole('region', { name: 'Что изменилось' });
    expect(view).toHaveTextContent('С прошлого обновления');
    expect(view).toHaveTextContent('Правки от 11.09.2026');
    const uk = within(view).getByRole('group', { name: /^УК / });
    const rows = within(uk).getAllByRole('button').map((b) => b.textContent);
    expect(rows).toEqual(['Измененост. 65Кража', expect.stringMatching(/^Добавленост\. 113\S/), 'Удаленост. 999Отменённое преступление']);
    await vi.waitFor(() => expect(platform.settings.get(SEEN)).toBe(VERSION));

    // Launched again with the same laws: nothing new to show.
    const settings = Object.fromEntries(platform.settings);
    cleanup();
    await renderApp({ settings });
    await vi.waitFor(() => expect(screen.getByRole('searchbox')).toBeInTheDocument());
    expect(changesScreen()).not.toBeInTheDocument();
  });

  it('opens a changed article as «было → стало»: the old text on the left, the new on the right', async () => {
    const { user } = await renderApp({ settings: { [SEEN]: '2026-09-01T10:00:00+03:00' } });
    const view = await screen.findByRole('region', { name: 'Что изменилось' });
    await user.click(within(view).getByRole('button', { name: /^Изменено/ }));

    const diff = screen.getByRole('article', { name: 'Было → стало: Статья 65. Кража' });
    expect(diff).toHaveTextContent('Изменено 11.09.2026');
    const before = within(diff).getByRole('region', { name: 'Было' });
    const after = within(diff).getByRole('region', { name: 'Стало' });
    expect(before).toHaveTextContent('1. Кража, то есть скрытое хищение имущества');
    expect(after).toHaveTextContent('1. Кража, то есть тайное хищение чужого имущества');
    expect([...before.querySelectorAll('mark')].map((m) => m.textContent)).toEqual(['скрытое']);
    expect([...after.querySelectorAll('mark')].map((m) => m.textContent)).toEqual(['тайное', 'чужого ']);

    // Esc steps back to the list, then off it.
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(changesScreen()).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(changesScreen()).not.toBeInTheDocument();
    expect(search()).toHaveFocus();
  });

  it('opens an added article whole and shows a removed one with nothing on the right', async () => {
    const { user } = await renderApp({ settings: { [SEEN]: '2026-09-01T10:00:00+03:00' } });
    const view = await screen.findByRole('region', { name: 'Что изменилось' });
    await user.click(within(view).getByRole('button', { name: /^Добавлено/ }));
    expect(screen.getByRole('article')).toHaveAccessibleName(/^Статья 113\./);
    await user.click(screen.getByRole('button', { name: 'Что изменилось' }));

    await user.click(within(changesScreen()!).getByRole('button', { name: /^Удалено/ }));
    const diff = screen.getByRole('article', { name: 'Было → стало: Статья 999. Отменённое преступление' });
    expect(within(diff).getByRole('region', { name: 'Было' })).toHaveTextContent('скрытое хищение');
    expect(diff).toHaveTextContent('Статья удалена');
    expect(within(diff).queryByRole('button', { name: 'Открыть статью целиком' })).not.toBeInTheDocument();
  });

  it('marks recently changed articles in the results and leads from the article to «было → стало»', async () => {
    const { user } = await renderApp();
    await user.type(search(), 'ук 65');
    const row = screen.getAllByRole('listitem')[0];
    expect(row).toHaveTextContent('ст. 65 ч. 1');
    expect(row).toHaveTextContent('изменено');
    await user.keyboard('{ArrowRight}');
    await user.click(screen.getByRole('button', { name: /^Изменено 11\.09\.2026/ }));
    const diff = screen.getByRole('article', { name: 'Было → стало: Статья 65. Кража' });
    // From the article «←» goes back to it; there is no need for «Открыть статью целиком».
    expect(within(diff).getByRole('button', { name: 'Статья' })).toBeInTheDocument();
    expect(within(diff).queryByRole('button', { name: 'Открыть статью целиком' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('article')).toHaveAccessibleName('Статья 65. Кража');
  });

  it('stops marking the articles two weeks after the update', async () => {
    vi.setSystemTime(new Date('2026-09-30T12:00:00+03:00'));
    const { user } = await renderApp();
    await user.type(search(), 'ук 65');
    expect(screen.getAllByRole('listitem')[0]).not.toHaveTextContent('изменено');
  });

  it('lists the updates of the last 60 days from the settings', async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    await user.click(screen.getByRole('button', { name: 'Что изменилось в законах' }));
    const view = screen.getByRole('region', { name: 'Что изменилось' });
    expect(view).toHaveTextContent('За 60 дней');
    expect(view).toHaveTextContent('Правки от 11.09.2026');
  });
});
