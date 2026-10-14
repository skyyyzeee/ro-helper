import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { searchArticles } from '../core';
import { ARBATSKIY_PACK, TVERSKOI_PACK } from '../data/bundled';
import { createFakePlatform } from '../platform/fake';
import { RECENT_LIMIT, favoritesKey, hitKey, recentKey, useSaved } from './saved';

const pack = TVERSKOI_PACK;
const found = (query: string) => searchArticles(pack, query)[0];

describe('useSaved (roadmap 2А)', () => {
  it('reads the server’s lists, leaving out what the laws no longer have, and the favourites out of the recent ones', async () => {
    const platform = createFakePlatform();
    const theft = hitKey(found('ук 65 ч 1'));
    const other = hitKey(found('ук 66'));
    platform.settings.set(favoritesKey('tverskoi'), [theft]);
    platform.settings.set(recentKey('tverskoi'), [theft, 'uk-9999#', other]);
    const { result } = renderHook(() => useSaved(platform, pack));
    await waitFor(() => expect(result.current.favorites.map(hitKey)).toEqual([theft]));
    expect(result.current.recent.map(hitKey)).toEqual([other]);
  });

  it('puts an opened article on top of the recent ones, keeps the limit, and saves it', async () => {
    const platform = createFakePlatform();
    platform.settings.set(recentKey('tverskoi'), Array.from({ length: RECENT_LIMIT }, (_, i) => `old-${i}#`));
    const { result } = renderHook(() => useSaved(platform, pack));
    await waitFor(() => expect(result.current.recentKeys).toHaveLength(RECENT_LIMIT));

    const hit = found('ук 65 ч 1');
    act(() => result.current.remember(hit));
    expect(result.current.recentKeys[0]).toBe(hitKey(hit));
    expect(result.current.recentKeys).toHaveLength(RECENT_LIMIT);
    expect((platform.settings.get(recentKey('tverskoi')) as string[])[0]).toBe(hitKey(hit));
  });

  it('marks and unmarks a favourite, per server', async () => {
    const platform = createFakePlatform();
    const { result, rerender } = renderHook(({ p }) => useSaved(platform, p), { initialProps: { p: pack } });
    const hit = found('ук 65 ч 1');
    act(() => result.current.toggleFavorite(hit));
    expect(platform.settings.get(favoritesKey('tverskoi'))).toEqual([hitKey(hit)]);
    act(() => result.current.toggleFavorite(hit));
    expect(platform.settings.get(favoritesKey('tverskoi'))).toEqual([]);

    platform.settings.set(favoritesKey('arbatskiy'), ['x#']);
    rerender({ p: ARBATSKIY_PACK });
    await waitFor(() => expect(result.current.favoriteKeys).toEqual(['x#']));
  });
});
