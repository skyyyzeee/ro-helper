import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TVERSKOI_PACK } from '../data';
import { renderApp } from '../test/renderApp';

const search = () => screen.getByRole('searchbox', { name: 'Поиск по законам' });
const banner = () => screen.queryByRole('button', { name: /^Законы обновлены/ });
const findBanner = () => screen.findByRole('button', { name: /^Законы обновлены/ });
const BANNER_KEY = 'changes.banner:tverskoi';
const SEEN = 'laws.seen:tverskoi';

beforeEach(() => {
  // Two days after the latest update of the bundled laws: still recent.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.parse(TVERSKOI_PACK.changes[0].version) + 2 * 24 * 3600 * 1000));
});
afterEach(() => vi.useRealTimers());

describe('home', () => {
  it('says the laws were updated, and leads to what changed; once seen, the banner goes', async () => {
    const { platform, user } = await renderApp({ settings: { [SEEN]: TVERSKOI_PACK.version } });
    const latest = TVERSKOI_PACK.changes[0];
    expect(await findBanner()).toHaveTextContent(`Законы обновлены ${latest.version.slice(8, 10)}.${latest.version.slice(5, 7)}`);
    await user.click(banner()!);
    expect(screen.getByRole('region', { name: 'Что изменилось' })).toBeInTheDocument();
    expect(platform.settings.get(BANNER_KEY)).toBe(latest.version);

    const settings = Object.fromEntries(platform.settings);
    cleanup();
    await renderApp({ settings });
    // Past the reading of the settings, when the banner would have come.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(banner()).not.toBeInTheDocument();
  });

  it('shows the favourites as tiles and the recent ones as rows, still gone through with the arrows', async () => {
    const { user } = await renderApp({ settings: { [SEEN]: TVERSKOI_PACK.version, [BANNER_KEY]: TVERSKOI_PACK.changes[0].version } });
    await user.type(search(), 'ук 65');
    await user.keyboard('{ArrowRight}');
    await user.click(screen.getByRole('button', { name: 'В избранное' }));
    await user.clear(search());
    await user.type(search(), 'ук 66');
    await user.keyboard('{ArrowRight}');
    await user.clear(search());
    await user.keyboard('{Escape}');

    const favorites = screen.getByRole('list', { name: 'Избранное' });
    expect(favorites).toHaveClass('list--tiles');
    const tile = within(favorites).getAllByRole('listitem')[0];
    expect(tile.querySelector('.row--tile')).toBeInTheDocument();
    expect(tile).toHaveTextContent('ст. 65 ч. 1');
    // A tile has the article and its punishment, not the tags of the row.
    expect(tile.querySelector('.stars, .jur')).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Недавние' }).querySelector('.row--tile')).not.toBeInTheDocument();
    expect(tile.querySelector('[aria-current="true"]')).toBeInTheDocument();
  });

  it('clears the recent articles, keeping the favourites', async () => {
    const settings = { [SEEN]: TVERSKOI_PACK.version, [BANNER_KEY]: TVERSKOI_PACK.changes[0].version };
    const { platform, user } = await renderApp({ settings });
    for (const query of ['ук 65', 'ук 66', 'коап 8.6']) {
      await user.clear(search());
      await user.type(search(), query);
      await user.keyboard('{ArrowRight}');
      if (query === 'ук 65') await user.click(screen.getByRole('button', { name: 'В избранное' }));
    }
    await user.clear(search());
    await user.keyboard('{Escape}');
    expect(within(screen.getByRole('list', { name: 'Недавние' })).getAllByRole('listitem')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Очистить недавние' }));
    expect(screen.queryByRole('list', { name: 'Недавние' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Очистить недавние' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Избранное' })).getAllByRole('listitem')).toHaveLength(1);
    expect(platform.settings.get('recent:tverskoi')).toEqual([]);
    expect(search()).toHaveFocus();
  });
});

describe('the notice that signing in will be required', () => {
  it('asks a player not signed in to sign in, leads to the account, and goes once put off', async () => {
    const settings = { [SEEN]: TVERSKOI_PACK.version, [BANNER_KEY]: TVERSKOI_PACK.changes[0].version };
    const { platform, user } = await renderApp({ settings });
    const notice = await screen.findByRole('region', { name: 'Вход скоро станет обязательным' });
    expect(notice).toHaveTextContent('Со следующего обновления');

    await user.click(within(notice).getByRole('button', { name: 'Войти' }));
    expect(within(screen.getByRole('group', { name: 'Настройки' })).getByRole('region', { name: 'Аккаунт' })).toBeInTheDocument();
    await user.keyboard('{Escape}');

    await user.click(within(screen.getByRole('region', { name: 'Вход скоро станет обязательным' })).getByRole('button', { name: 'Позже' }));
    expect(screen.queryByRole('region', { name: 'Вход скоро станет обязательным' })).not.toBeInTheDocument();
    expect(platform.settings.get('login.notice')).toBe('later');
  });

  it('is not shown to a player signed in', async () => {
    await renderApp({ settings: { [SEEN]: TVERSKOI_PACK.version }, account: { id: 'user-1', name: 'Skyze', via: 'discord' } });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole('region', { name: 'Вход скоро станет обязательным' })).not.toBeInTheDocument();
  });
});
