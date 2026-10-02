import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { QuickBridge, QuickRequest, QuickState } from '../platform/types';
import { renderApp } from '../test/renderApp';
import { QuickSearch } from './QuickSearch';

/** The bar on its own, with the settings given; what it asks of the overlay is written down, what it is told is ours to say. */
function renderBar(settings: Record<string, unknown> = { profile: { server: 'tverskoi', organization: 'mvd', hotkey: 'Alt+Q' } }) {
  const requests: QuickRequest[] = [];
  const shown = new Set<() => void>();
  const told = new Set<(state: QuickState) => void>();
  let hidden = 0;
  const bridge: QuickBridge = {
    readSetting: async <T,>(key: string) => settings[key] as T | undefined,
    readLaws: async () => undefined,
    onShown(listener) {
      shown.add(listener);
      return () => shown.delete(listener);
    },
    hide: async () => {
      hidden += 1;
    },
    request: async (request) => {
      if (request.kind !== 'hello') requests.push(request);
    },
    onState(listener) {
      told.add(listener);
      return () => told.delete(listener);
    },
  };
  render(<QuickSearch bridge={bridge} />);
  return {
    requests,
    hidden: () => hidden,
    show: () => act(() => shown.forEach((listener) => listener())),
    tell: (state: QuickState) => act(() => told.forEach((listener) => listener(state))),
    user: userEvent.setup(),
  };
}

const field = () => screen.getByRole('searchbox');
const results = () => screen.getByRole('list', { name: 'Результаты быстрого поиска' });

describe('the quick search', () => {
  it('finds articles as the player types, and Enter asks the assistant to put the chosen one into its calculator', async () => {
    const { requests, tell, user } = renderBar();
    expect(field()).toHaveFocus();
    await user.type(field(), 'кража');
    const rows = within(results()).getAllByRole('listitem');
    expect(rows.length).toBeLessThanOrEqual(8);
    expect(rows[0]).toHaveTextContent('ст. 65 ч. 1');

    await user.keyboard('{ArrowDown}{Enter}');
    expect(requests).toEqual([{ kind: 'charge', key: 'uk-65#2' }]);
    // What is in the calculator is the assistant's to say.
    await tell({ charges: ['uk-65#2'], recent: [] });
    expect(screen.getByRole('button', { name: /В калькуляторе: 1/ })).toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(requests).toHaveLength(1);
    // Emptied from the bar, without opening the assistant (issue #23).
    await user.click(screen.getByRole('button', { name: 'Очистить калькулятор' }));
    expect(requests.at(-1)).toEqual({ kind: 'clear-charges' });
  });

  it('opens an article in the bar with →, adding it to the recent ones; Esc steps back, then hides the bar', async () => {
    const { requests, hidden, user } = renderBar();
    await user.type(field(), 'ук 65{ArrowRight}');
    expect(requests).toEqual([{ kind: 'remember', key: 'uk-65#1' }]);
    const article = screen.getByRole('article', { name: 'Статья 65. Кража' });
    await user.click(within(article).getAllByRole('button', { name: 'В калькулятор' })[1]);
    expect(requests.at(-1)).toEqual({ kind: 'charge', key: 'uk-65#2' });

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(results()).toBeInTheDocument();
    expect(hidden()).toBe(0);
    await user.keyboard('{Escape}');
    expect(hidden()).toBe(1);
  });

  it('puts the part an article was opened at into the calculator with Enter', async () => {
    const { requests, user } = renderBar();
    await user.type(field(), 'ук 65 ч 2{ArrowRight}');
    await user.keyboard('{Enter}');
    expect(requests.at(-1)).toEqual({ kind: 'charge', key: 'uk-65#2' });
  });

  it('tells over the game where it looked, and offers what does find something (roadmap 1В)', async () => {
    const { user } = renderBar();
    await user.type(field(), 'кража пылесоса');
    const why = screen.getByRole('status', { name: 'Ничего не найдено' });
    expect(why).toHaveTextContent(/^Ничего не найдено в \d+ документах/);
    await user.click(within(why).getByRole('button', { name: 'без «пылесоса»' }));
    expect(field()).toHaveValue('кража');
    expect(within(results()).getAllByRole('listitem').length).toBeGreaterThan(0);
  });

  it('turns to the AI with Tab: Enter asks the assistant, and the bar goes', async () => {
    const { requests, hidden, user } = renderBar();
    await user.type(field(), 'украл телефон у прохожего');
    await user.keyboard('{Tab}');
    expect(screen.getByRole('radio', { name: 'ИИ' })).toBeChecked();
    expect(screen.getByRole('searchbox', { name: 'Вопрос ИИ' })).toHaveValue('украл телефон у прохожего');
    await user.keyboard('{Enter}');
    expect(requests).toEqual([{ kind: 'ask', question: 'украл телефон у прохожего' }]);
    await vi.waitFor(() => expect(hidden()).toBe(1));
  });

  it('lists the recent articles, which can be cleared (issue #20)', async () => {
    const { requests, tell, user } = renderBar();
    await tell({ charges: [], recent: ['uk-66#1', 'uk-65#1'] });
    await user.click(screen.getByRole('radio', { name: 'Недавние' }));
    const recent = screen.getByRole('list', { name: 'Недавние' });
    expect(within(recent).getAllByRole('listitem').map((li) => li.textContent)).toEqual([expect.stringMatching(/ст\. 66 ч\. 1/), expect.stringMatching(/ст\. 65 ч\. 1/)]);
    await user.click(screen.getByRole('button', { name: 'Очистить недавние' }));
    expect(requests).toEqual([{ kind: 'clear-recent' }]);
  });

  it('searches the laws of the player’s server, and keeps what was typed when shown again', async () => {
    const { show, user } = renderBar({ profile: { server: 'arbatskiy', organization: 'none', hotkey: 'Alt+Q' } });
    expect(await screen.findByPlaceholderText('Поиск: Арбатский')).toBeInTheDocument();
    await user.type(field(), 'угнал');
    expect(within(results()).getAllByRole('listitem')[0]).toHaveTextContent('ст. 10.3');

    await show();
    expect(field()).toHaveValue('угнал');
    expect(field()).toHaveFocus();
    expect(results()).toBeInTheDocument();
  });
});

/**
 * The assistant, once it listens to the bar: its key is registered after its settings are read. A request sent
 * before that would be lost in a test — the bar itself asks again whenever it is shown.
 */
async function openApp() {
  const app = await renderApp();
  await vi.waitFor(() => expect(app.platform.state.quickHotkey).toBe('Alt+S'), { timeout: 4000 });
  return app;
}

describe('the overlay, for the quick search', () => {
  it('registers the quick search key, puts into the calculator what the bar sends — pinned over the game — and tells the bar', async () => {
    const { platform } = await openApp();
    act(() => platform.quickRequest({ kind: 'charge', key: 'uk-65#1' }));
    expect(await screen.findByRole('complementary', { name: 'Калькулятор' }, { timeout: 4000 })).toHaveTextContent('ст. 65 ч. 1');
    await vi.waitFor(() => expect(platform.state.pins.flatMap((group) => group.cards).map((card) => card.id)).toContain('calculator'));
    await vi.waitFor(() => expect(platform.state.quickState?.charges).toEqual(['uk-65#1']), { timeout: 4000 });
  });

  it('empties the calculator when the bar or its card over the game asks, and the card goes (issue #23)', async () => {
    const { platform } = await openApp();
    const pinned = () => platform.state.pins.some((group) => group.cards.some((card) => card.id === 'calculator'));
    for (const clear of [() => platform.quickRequest({ kind: 'clear-charges' }), () => platform.clearCalculatorFromPin()]) {
      act(() => platform.quickRequest({ kind: 'charge', key: 'uk-65#1' }));
      await vi.waitFor(() => expect(pinned()).toBe(true), { timeout: 4000 });
      act(clear);
      await vi.waitFor(() => expect(platform.state.quickState?.charges).toEqual([]), { timeout: 4000 });
      await vi.waitFor(() => expect(pinned()).toBe(false));
    }
  });

  it('pins the calculator back where the player last left it (issue #22)', async () => {
    const { platform } = await openApp();
    const calculator = () => platform.state.pins.find((group) => group.cards.some((card) => card.id === 'calculator'));
    act(() => platform.quickRequest({ kind: 'charge', key: 'uk-65#1' }));
    await vi.waitFor(() => expect(calculator()).toBeDefined(), { timeout: 4000 });
    // Dragged over the game, then closed there.
    act(() => platform.changePins(platform.state.pins.map((group) => (group === calculator() ? { ...group, x: 300, y: 90 } : group))));
    await vi.waitFor(() => expect(platform.settings.get('pins.calculator')).toEqual({ x: 300, y: 90 }));
    act(() => platform.changePins(platform.state.pins.filter((group) => group !== calculator())));
    await vi.waitFor(() => expect(calculator()).toBeUndefined());

    act(() => platform.quickRequest({ kind: 'charge', key: 'uk-66#1' }));
    await vi.waitFor(() => expect(calculator()).toMatchObject({ x: 300, y: 90 }), { timeout: 4000 });
  });

  it('keeps the recent articles the bar opened, and clears them when it asks', async () => {
    const { platform } = await openApp();
    act(() => platform.quickRequest({ kind: 'remember', key: 'uk-66#1' }));
    await vi.waitFor(() => expect(platform.state.quickState?.recent).toEqual(['uk-66#1']), { timeout: 4000 });
    expect(platform.settings.get('recent:tverskoi')).toEqual(['uk-66#1']);
    act(() => platform.quickRequest({ kind: 'clear-recent' }));
    await vi.waitFor(() => expect(platform.state.quickState?.recent).toEqual([]), { timeout: 4000 });
  });

  it('opens itself on the AI with the question the bar asked', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('offline');
    });
    try {
      const { platform } = await openApp();
      act(() => platform.quickRequest({ kind: 'ask', question: 'украл телефон у прохожего' }));
      expect(await screen.findByRole('region', { name: 'ИИ-разбор' }, { timeout: 4000 })).toHaveTextContent('украл телефон у прохожего');
      expect(platform.calls.some((call) => call.method === 'showOverlay')).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('lets the player turn the key off in «Клавиши»', async () => {
    const { platform, user } = await renderApp();
    await vi.waitFor(() => expect(platform.state.quickHotkey).toBe('Alt+S'));
    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    const block = within(screen.getByRole('group', { name: 'Настройки' })).getByRole('region', { name: 'Быстрый поиск' });
    await user.click(within(block).getByRole('switch', { name: 'Быстрый поиск поверх игры' }));
    expect(platform.settings.get('quick.hotkey')).toBe('');
    await vi.waitFor(() => expect(platform.state.quickHotkey).toBeNull());
  });
});
