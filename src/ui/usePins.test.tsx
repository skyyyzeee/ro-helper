import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createFakePlatform } from '../platform/fake';
import type { PinGroup } from '../platform/types';
import { pinsKey, usePins } from './usePins';

const card = (id: string): PinGroup => ({ id, x: 40, y: 300, cards: [{ id, kind: 'article', heading: id, lines: [] }] });

describe('usePins (roadmap 2А)', () => {
  it('reads the server’s saved cards, then keeps every change in the settings and on the pin window', async () => {
    const platform = createFakePlatform();
    platform.settings.set(pinsKey('tverskoi'), [card('uk-65#1')]);
    const { result } = renderHook(() => usePins(platform, 'tverskoi'));
    await waitFor(() => expect(result.current.groups.map((g) => g.id)).toEqual(['uk-65#1']));

    act(() => result.current.setGroups((list) => [...list, card('uk-66#1')]));
    await waitFor(() => expect((platform.settings.get(pinsKey('tverskoi')) as PinGroup[]).map((g) => g.id)).toEqual(['uk-65#1', 'uk-66#1']));
    expect(platform.state.pins.map((g) => g.id)).toEqual(['uk-65#1', 'uk-66#1']);
  });

  it('takes what the player did on the cards themselves, and another server’s cards for another server', async () => {
    const platform = createFakePlatform();
    platform.settings.set(pinsKey('tverskoi'), [card('uk-65#1')]);
    platform.settings.set(pinsKey('arbatskiy'), [card('uk-10.2#1')]);
    const { result, rerender } = renderHook(({ server }) => usePins(platform, server), { initialProps: { server: 'tverskoi' } });
    await waitFor(() => expect(result.current.groups).toHaveLength(1));

    // Closed over the game.
    act(() => platform.changePins([]));
    await waitFor(() => expect(result.current.groups).toEqual([]));

    rerender({ server: 'arbatskiy' });
    await waitFor(() => expect(result.current.groups.map((g) => g.id)).toEqual(['uk-10.2#1']));
  });

  it('keeps a card pinned before the saved ones were read (the quick search’s calculator), beside them', async () => {
    const platform = createFakePlatform();
    platform.settings.set(pinsKey('tverskoi'), [card('uk-65#1')]);
    const { result } = renderHook(() => usePins(platform, 'tverskoi'));
    act(() => result.current.setGroups((list) => [...list, card('calculator')]));
    await waitFor(() => expect(result.current.groups.map((g) => g.id)).toEqual(['uk-65#1', 'calculator']));
  });
});
