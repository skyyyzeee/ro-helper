import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendArticleCounts } from '../account/usage';
import { createFakePlatform } from '../platform/fake';
import { renderApp } from '../test/renderApp';

const home = () => screen.getByRole('list', { name: 'Популярное у игроков' });

describe('the home screen (skyze): boosts, what players open most, favourites, recent', () => {
  afterEach(() => vi.useRealTimers());

  it('shows the articles players opened most on the server, leaving out one the laws no longer have', async () => {
    await renderApp({ settings: { 'popular:tverskoi': { at: Date.now(), keys: ['uk-65#1', 'gone-1#'] } } });
    const rows = within(await screen.findByRole('list', { name: 'Популярное у игроков' })).getAllByRole('listitem');
    expect(rows).toHaveLength(1);
    expect(home()).toHaveTextContent('ст. 65');
  });

  it('counts an article opened for everyone’s top: the day, the server and the article, nothing of the player', async () => {
    const { platform, user } = await renderApp();
    await user.type(screen.getByRole('searchbox', { name: 'Поиск по законам' }), 'ук 65');
    await user.keyboard('{ArrowRight}');
    await vi.waitFor(() => expect(Object.keys(platform.settings.get('usage.articles') as object)).toEqual([expect.stringMatching(/^\d{4}-\d{2}-\d{2}\|tverskoi\|uk-65#/)]));
  });

  it('shows the jobs with a bonus on now, Moscow time, and opens one in the wiki', async () => {
    // 08:00 in Moscow: the miner's and the builder's bonus hours.
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-23T05:00:00Z') });
    const { user } = await renderApp();
    const boosts = screen.getByRole('region', { name: 'Бусты на работах' });
    expect(within(boosts).getByRole('button', { name: /Шахтёр/ })).toHaveTextContent('Шахтёр+15%ещё 7 ч');
    await user.click(within(boosts).getByRole('button', { name: /Шахтёр/ }));
    expect(await screen.findByRole('article', { name: 'Шахтёр' }, { timeout: 5000 })).toBeInTheDocument();
  });

  it('has the home in the side column instead of the search, and no «Закреплённое» there', async () => {
    await renderApp();
    const rail = screen.getByRole('navigation', { name: 'Разделы' });
    expect(within(rail).getByRole('button', { name: 'Главная' })).toHaveAttribute('aria-current', 'page');
    expect(within(rail).queryByRole('button', { name: 'Поиск' })).not.toBeInTheDocument();
    expect(within(rail).queryByRole('button', { name: 'Закреплённое' })).not.toBeInTheDocument();
  });
});

describe('the article counts, sent', () => {
  const at = (iso: string) => new Date(iso);

  it('sends what gathered at most once an hour, the most opened first, and nothing once the counts are turned off', async () => {
    const platform = createFakePlatform();
    platform.settings.set('usage.articles', { '2026-10-23|tverskoi|uk-65#1': 2, '2026-10-23|tverskoi|koap-8.6#1': 5, '2026-09-01|tverskoi|uk-65#1': 9 });
    const sent: unknown[] = [];
    await sendArticleCounts(platform, async (counts) => void sent.push(counts), at('2026-10-23T12:00:00'));
    expect(sent).toEqual([
      [
        { day: '2026-10-23', server: 'tverskoi', article: 'koap-8.6#1', count: 5 },
        { day: '2026-10-23', server: 'tverskoi', article: 'uk-65#1', count: 2 },
      ],
    ]);
    expect(platform.settings.get('usage.articles')).toEqual({});
    platform.settings.set('usage.articles', { '2026-10-23|tverskoi|uk-65#1': 1 });
    await sendArticleCounts(platform, async (counts) => void sent.push(counts), at('2026-10-23T12:30:00'));
    expect(sent).toHaveLength(1);

    platform.settings.set('usage.share', false);
    const send = vi.fn();
    await sendArticleCounts(platform, send, at('2026-10-23T14:00:00'));
    expect(send).not.toHaveBeenCalled();
    expect(platform.settings.get('usage.articles')).toEqual({});
  });
});
