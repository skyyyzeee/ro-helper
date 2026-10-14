import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createFakePlatform } from '../platform/fake';
import type { QuickState } from '../platform/types';
import { DEFAULT_QUICK_HOTKEY, QUICK_HOTKEY_KEY } from './overlaySettings';
import { useQuickBridge, type QuickActions } from './useQuickBridge';

const actions = (): QuickActions => ({ charge: vi.fn(), remember: vi.fn(), clearRecent: vi.fn(), clearCharges: vi.fn(), ask: vi.fn(), open: vi.fn() });

describe('useQuickBridge (roadmap 2А)', () => {
  it('registers the bar’s saved key, and keeps a changed one', async () => {
    const platform = createFakePlatform();
    platform.settings.set(QUICK_HOTKEY_KEY, 'Alt+Q');
    const { result } = renderHook(() => useQuickBridge(platform, { capturing: false, taken: [], state: { charges: [], recent: [] }, actions: actions() }));
    await waitFor(() => expect(platform.state.quickHotkey).toBe('Alt+Q'));

    act(() => result.current.changeQuickHotkey('Alt+W'));
    await waitFor(() => expect(platform.state.quickHotkey).toBe('Alt+W'));
    expect(platform.settings.get(QUICK_HOTKEY_KEY)).toBe('Alt+W');
  });

  it('registers no key while one is being recorded, nor one the overlay already uses', async () => {
    const platform = createFakePlatform();
    const { rerender } = renderHook(({ capturing }) => useQuickBridge(platform, { capturing, taken: [DEFAULT_QUICK_HOTKEY], state: { charges: [], recent: [] }, actions: actions() }), {
      initialProps: { capturing: true },
    });
    rerender({ capturing: false });
    await act(async () => {});
    expect(platform.state.quickHotkey).toBeNull();
  });

  it('does what the bar asks with what the overlay has now', async () => {
    const platform = createFakePlatform();
    const first = actions();
    const later = actions();
    const { rerender } = renderHook(({ acts }) => useQuickBridge(platform, { capturing: false, taken: [], state: { charges: [], recent: [] }, actions: acts }), {
      initialProps: { acts: first },
    });
    rerender({ acts: later });
    act(() => platform.quickRequest({ kind: 'charge', key: 'uk-65#1' }));
    act(() => platform.quickRequest({ kind: 'ask', question: 'Что за 65?' }));
    act(() => platform.quickRequest({ kind: 'clear-recent' }));
    expect(first.charge).not.toHaveBeenCalled();
    expect(later.charge).toHaveBeenCalledWith('uk-65#1');
    expect(later.ask).toHaveBeenCalledWith('Что за 65?');
    expect(later.clearRecent).toHaveBeenCalled();
  });

  it('tells the bar what is in the calculator and the recent articles, on every change and when it starts', async () => {
    const platform = createFakePlatform();
    const { rerender } = renderHook(({ state }: { state: QuickState }) => useQuickBridge(platform, { capturing: false, taken: [], state, actions: actions() }), {
      initialProps: { state: { charges: [] as string[], recent: ['uk-65#1'] } },
    });
    await waitFor(() => expect(platform.state.quickState).toEqual({ charges: [], recent: ['uk-65#1'] }));
    rerender({ state: { charges: ['uk-65#1'], recent: ['uk-65#1'] } });
    await waitFor(() => expect(platform.state.quickState?.charges).toEqual(['uk-65#1']));

    platform.state.quickState = null;
    act(() => platform.quickRequest({ kind: 'hello' }));
    await waitFor(() => expect(platform.state.quickState).toEqual({ charges: ['uk-65#1'], recent: ['uk-65#1'] }));
  });
});
