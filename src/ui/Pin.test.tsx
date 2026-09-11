import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PinBridge } from '../platform/tauri';
import type { PinCard } from '../platform/types';
import { renderApp } from '../test/renderApp';
import { PinCardView, PinWindow } from './PinCardView';

type User = Awaited<ReturnType<typeof renderApp>>['user'];

const search = () => screen.getByRole('searchbox', { name: 'Поиск по законам' });
const panel = () => screen.getByRole('complementary', { name: 'Калькулятор' });

async function add(user: User, query: string) {
  await user.clear(search());
  await user.type(search(), query);
  await user.keyboard('{Enter}');
}

async function open(user: User, query: string) {
  await user.clear(search());
  await user.type(search(), query);
  await user.keyboard('{ArrowRight}');
}

const pinArticle = (user: User) => user.click(within(screen.getByRole('article')).getByRole('button', { name: 'Закрепить' }));
const pinCalculator = (user: User) => user.click(within(panel()).getByRole('button', { name: 'Закрепить итог поверх игры' }));

describe('pinning an article', () => {
  it('pins only the part it was opened on, and the overlay stays open', async () => {
    const { platform, user } = await renderApp();
    await user.type(search(), 'ук 65');
    await user.keyboard('{ArrowDown}{ArrowRight}');
    await pinArticle(user);

    expect(platform.state.overlayVisible).toBe(true);
    expect(screen.getByRole('article')).toBeInTheDocument();
    expect(platform.state.pin).toMatchObject({ kind: 'article', heading: 'УК ст. 65 ч. 2. Кража', accent: 'штраф до 90 000 ₽ либо 40 мес' });
    expect(platform.state.pin!.lines).toEqual([expect.stringMatching(/^Кража, совершенная/)]);
  });
});

describe('a point with its list (ФСО 5.1)', () => {
  it("is found by a sub-point's number, shows the list, and pins it", async () => {
    const { platform, user } = await renderApp();
    await open(user, 'уфсо 5.1.3');
    const point = screen.getByRole('article', { name: 'Пункт 5.1' });
    expect(point).toHaveTextContent('5.1.3. Строгий выговор. Основания: Систематические нарушения, игнорирование прямых приказов.');

    await pinArticle(user);
    expect(platform.state.pin?.heading).toMatch(/^Регламент п. 5.1. За нарушение/);
    expect(platform.state.pin?.lines).toHaveLength(7);
    expect(platform.state.pin?.lines[1]).toBe('5.1.1. Замечание (устное). Основания: Мелкое нарушение, совершённое впервые. Выносит: Командир подразделения.');
  });
});

describe('pinning the calculator', () => {
  it('pins the total, the charges and the КоАП total, and follows the calculator', async () => {
    const { platform, user } = await renderApp();
    await add(user, 'ук 65 ч 1');
    await add(user, 'коап 8.6 ч 1');
    await pinCalculator(user);

    expect(platform.state.overlayVisible).toBe(false);
    expect(platform.state.pin).toEqual<PinCard>({
      kind: 'calculator',
      heading: '30 мес',
      stars: 3,
      lines: ['ст. 65 ч. 1 УК; ст. 8.6 ч. 1 КоАП', 'КоАП: штраф 10 000 ₽'],
    });

    await add(user, 'ук 88 ч 1');
    expect(platform.state.pin).toMatchObject({
      heading: '40 мес',
      stars: 4,
      warning: 'ст. 88 ч. 1 — федеральная подследственность — дело ФСБ',
    });

    await user.click(within(panel()).getByRole('button', { name: 'Очистить' }));
    expect(platform.state.pin).toBeNull();
    expect(platform.calls.some((c) => c.method === 'hidePin')).toBe(true);
  });

  it('shows the fine when the officer picked one, and the КоАП total when there is no УК', async () => {
    const { platform, user } = await renderApp();
    await add(user, 'коап 5.4 ч 1');
    await user.click(within(panel()).getByRole('radio', { name: 'арест' }));
    await pinCalculator(user);
    expect(platform.state.pin).toMatchObject({ heading: 'арест 20 сут', stars: 2, lines: ['ст. 5.4 ч. 1 КоАП'] });

    await add(user, 'ук 57');
    await user.click(within(panel()).getByRole('radio', { name: 'Штраф' }));
    expect(platform.state.pin!.heading).toBe('Штраф до 100 000 ₽');
    await user.type(within(panel()).getByRole('textbox', { name: 'Сумма штрафа' }), '50000');
    expect(platform.state.pin!.heading).toBe('Штраф 50 000 ₽');
  });
});

describe('one card at a time', () => {
  it('replaces the card with a new pin, and the calculator no longer changes it', async () => {
    const { platform, user } = await renderApp();
    await add(user, 'ук 65 ч 1');
    await pinCalculator(user);
    await open(user, 'ук 104');
    await pinArticle(user);
    expect(platform.state.pin!.kind).toBe('article');

    await add(user, 'ук 88 ч 1');
    expect(platform.state.pin!.kind).toBe('article');
  });

  it('forgets the card closed with its own cross', async () => {
    const { platform, user } = await renderApp();
    await add(user, 'ук 65 ч 1');
    await pinCalculator(user);
    act(() => platform.closePin());

    await add(user, 'ук 88 ч 1');
    expect(platform.state.pin).toBeNull();
  });

  it('shows the card on the stand-in game scene of the browser preview, closed with its cross', async () => {
    const { platform, user } = await renderApp({ platform: { kind: 'browser' } });
    await add(user, 'ук 65 ч 1');
    await pinCalculator(user);
    const card = screen.getByRole('region', { name: 'Закреплено' });
    expect(card).toHaveTextContent('30 мес');

    await user.click(within(card).getByRole('button', { name: 'Открепить' }));
    expect(screen.queryByRole('region', { name: 'Закреплено' })).not.toBeInTheDocument();
    expect(platform.state.pin).toBeNull();
  });
});

describe('the card', () => {
  const card: PinCard = { kind: 'article', heading: 'УК ст. 104. Оскорбление', accent: 'штраф до 40 000 ₽ либо 30 мес', lines: ['Текст'] };

  it('can be closed only while the overlay is open', () => {
    const onClose = vi.fn();
    const { rerender } = render(<PinCardView card={card} live={false} onClose={onClose} />);
    expect(screen.queryByRole('button', { name: 'Открепить' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Закреплено' })).not.toHaveAttribute('data-tauri-drag-region');

    rerender(<PinCardView card={card} live onClose={onClose} />);
    screen.getByRole('button', { name: 'Открепить' }).click();
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByRole('region', { name: 'Закреплено' })).toHaveAttribute('data-tauri-drag-region');
  });

  it('in its window takes the card pinned before it loaded, the next ones, and closes through the bridge', async () => {
    let sendCard: (card: PinCard) => void = () => {};
    let sendLive: (live: boolean) => void = () => {};
    const bridge: PinBridge = {
      state: async () => ({ card, live: false }),
      onCard: (listener) => ((sendCard = listener), () => {}),
      onLive: (listener) => ((sendLive = listener), () => {}),
      close: vi.fn(async () => {}),
      fit: vi.fn(async () => {}),
    };
    render(<PinWindow bridge={bridge} />);
    expect(await screen.findByText('УК ст. 104. Оскорбление')).toBeInTheDocument();
    expect(bridge.fit).toHaveBeenCalled();

    act(() => sendCard({ kind: 'calculator', heading: '40 мес', stars: 4, lines: ['ст. 88 ч. 1 УК'] }));
    expect(screen.getByText('40 мес')).toBeInTheDocument();

    act(() => sendLive(true));
    await userEvent.click(screen.getByRole('button', { name: 'Открепить' }));
    expect(bridge.close).toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: 'Закреплено' })).not.toBeInTheDocument();
  });
});
