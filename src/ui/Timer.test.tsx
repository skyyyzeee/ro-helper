import { act, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PinGroup } from '../platform/types';
import { pinnedCards, renderApp } from '../test/renderApp';
import { elapsed, timerPinCard } from './pinCards';
import { PinSurface } from './PinSurface';

const OFFICER = { profile: { organization: 'mvd' } };
const timerCard = (platform: Awaited<ReturnType<typeof renderApp>>['platform']) => pinnedCards(platform).find((card) => card.kind === 'timer');

async function officer() {
  const app = await renderApp(OFFICER);
  await vi.waitFor(() => expect(app.platform.state.shortcuts.timer).toBe('Ctrl+Shift+T'));
  return app;
}

describe('the detention timer (issue #40)', () => {
  it('starts at its key as a card over the game, stops at the next press, and starts anew at the third', async () => {
    const { platform } = await officer();
    expect(timerCard(platform)).toBeUndefined();

    act(() => platform.pressShortcut('timer'));
    await vi.waitFor(() => expect(timerCard(platform)).toMatchObject({ heading: 'Задержание', since: expect.any(Number) }));
    const started = timerCard(platform)!.since!;
    expect(timerCard(platform)!.stopped).toBeUndefined();

    act(() => platform.pressShortcut('timer'));
    await vi.waitFor(() => expect(timerCard(platform)!.stopped).toEqual(expect.any(Number)));
    expect(timerCard(platform)!.since).toBe(started);

    act(() => platform.pressShortcut('timer'));
    await vi.waitFor(() => expect(timerCard(platform)!.stopped).toBeUndefined());
  });

  it('is over when its card is closed over the game: the next press starts a new one', async () => {
    const { platform } = await officer();
    act(() => platform.pressShortcut('timer'));
    await vi.waitFor(() => expect(timerCard(platform)).toBeDefined());
    act(() => platform.changePins(platform.state.pins.filter((group) => !group.cards.some((card) => card.kind === 'timer'))));
    await vi.waitFor(() => expect(timerCard(platform)).toBeUndefined());

    act(() => platform.pressShortcut('timer'));
    await vi.waitFor(() => expect(timerCard(platform)).toMatchObject({ since: expect.any(Number) }));
    expect(timerCard(platform)!.stopped).toBeUndefined();
  });

  it('is started from the faction’s page too', async () => {
    const { platform, user } = await officer();
    await user.click(within(screen.getByRole('navigation', { name: 'Разделы' })).getByRole('button', { name: 'Отдел: порядок действий по закону' }));
    await user.click(screen.getByRole('button', { name: 'Запустить таймер задержания' }));
    await vi.waitFor(() => expect(timerCard(platform)).toBeDefined());
    await user.click(screen.getByRole('button', { name: 'Остановить таймер задержания' }));
    await vi.waitFor(() => expect(timerCard(platform)!.stopped).toEqual(expect.any(Number)));
  });

  it('has its key in «Клавиши», which the player may turn off', async () => {
    const { platform, user } = await officer();
    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    const block = within(screen.getByRole('group', { name: 'Настройки' })).getByRole('region', { name: 'Таймер задержания' });
    await user.click(within(block).getByRole('switch', { name: 'Таймер задержания поверх игры' }));
    expect(platform.settings.get('timer.hotkey')).toBe('');
    await vi.waitFor(() => expect(platform.state.shortcuts.timer).toBeUndefined());
  });

  it('is for the forces of the state: no key held for anyone else', async () => {
    const { platform, user } = await renderApp();
    await vi.waitFor(() => expect(platform.state.quickHotkey).toBe('Alt+S'));
    expect(platform.state.shortcuts.timer).toBeUndefined();
    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    expect(within(screen.getByRole('group', { name: 'Настройки' })).queryByRole('region', { name: 'Таймер задержания' })).not.toBeInTheDocument();
  });
});

describe('the timer’s card', () => {
  const block = (since: number, stopped?: number): PinGroup[] => [{ id: 'timer', x: 40, y: 300, cards: [timerPinCard(since, stopped)] }];

  it('counts the minutes and seconds, the hours past sixty', () => {
    expect(elapsed(65_000)).toBe('01:05');
    expect(elapsed(3_727_000)).toBe('1:02:07');
    expect(elapsed(-5)).toBe('00:00');
  });

  it('shows how long the detention has run, and ticks', () => {
    vi.useFakeTimers({ now: new Date('2026-10-06T18:40:00Z') });
    try {
      render(<PinSurface groups={block(Date.now() - 65_000)} live={false} onChange={() => {}} />);
      expect(screen.getByRole('timer', { name: 'Время задержания' })).toHaveTextContent('01:05');
      act(() => void vi.advanceTimersByTime(2000));
      expect(screen.getByRole('timer', { name: 'Время задержания' })).toHaveTextContent('01:07');
    } finally {
      vi.useRealTimers();
    }
  });

  it('stands at the time it was stopped at', () => {
    const since = Date.parse('2026-10-06T18:40:00Z');
    render(<PinSurface groups={block(since, since + 125_000)} live={false} onChange={() => {}} />);
    expect(screen.getByRole('timer', { name: 'Время задержания' })).toHaveTextContent('02:05');
    expect(screen.getByRole('region', { name: 'Закреплено' })).toHaveTextContent('Задержание · с 21:40 МСК · остановлен');
  });
});
