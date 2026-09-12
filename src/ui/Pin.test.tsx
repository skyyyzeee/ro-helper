import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PinBridge } from '../platform/tauri';
import type { PinCard, PinGroup } from '../platform/types';
import { pinnedCards, renderApp } from '../test/renderApp';
import { PinSurface, PinWindow, TOAST_MS } from './PinSurface';

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
    expect(pinnedCards(platform)[0]).toMatchObject({
      kind: 'article',
      heading: 'УК ст. 65 ч. 2. Кража',
      punishment: [{ text: 'штраф до 90 000 ₽ либо 40 мес' }],
    });
    expect(pinnedCards(platform)[0].lines).toEqual([expect.stringMatching(/^Кража, совершенная/)]);
  });
});

describe('the punishment on the card', () => {
  it('carries every line of it — whom it is for included — and what comes on top', async () => {
    const { platform, user } = await renderApp();
    await open(user, 'коап 5.4 ч 1');
    await pinArticle(user);
    expect(pinnedCards(platform)[0].punishment).toEqual([
      { who: 'Гражданам', text: 'штраф от 10 000 до 25 000 ₽ либо арест до 20 сут' },
      { who: 'Должностным лицам', text: 'штраф от 30 000 до 50 000 ₽ либо арест до 20 сут' },
      { who: 'Юридическим лицам', text: 'штраф от 25 000 до 100 000 ₽' },
    ]);

    // A punishment that is the same for everyone is one line, without naming whom.
    await open(user, 'ук 108 ч 1');
    await pinArticle(user);
    expect(pinnedCards(platform)[1]).toMatchObject({
      punishment: [{ text: 'штраф до 40 000 ₽ либо 20 мес' }],
      extra: ['лишение воинского звания'],
    });
  });

  it('takes the punishment of a rule of the project, which the rules write as a note', async () => {
    const { platform, user } = await renderApp();
    await open(user, 'передавать аккаунт');
    await pinArticle(user);
    expect(pinnedCards(platform)[0]).toMatchObject({ heading: expect.stringMatching(/^Правила п\. 2\.2/), penalty: 'PermBan.' });
    expect(pinnedCards(platform)[0].punishment).toBeUndefined();
    // The rule's text is its own heading: the card does not say it twice.
    expect(pinnedCards(platform)[0].lines).toEqual([]);
  });

  it('shows the lines on the card itself', () => {
    render(
      <PinSurface
        groups={[
          {
            id: 'a',
            x: 0,
            y: 0,
            cards: [
              {
                id: 'a',
                kind: 'article',
                heading: 'КоАП ст. 5.4 ч. 1',
                punishment: [
                  { who: 'Гражданам', text: 'штраф от 10 000 ₽' },
                  { who: 'Должностным лицам', text: 'штраф от 30 000 ₽' },
                ],
                extra: ['лишение права управления'],
                lines: ['Текст'],
              },
            ],
          },
        ]}
        live={false}
        onChange={() => {}}
      />,
    );
    const card = screen.getByRole('region', { name: 'Закреплено' });
    expect(card).toHaveTextContent('Гражданам: штраф от 10 000 ₽');
    expect(card).toHaveTextContent('Должностным лицам: штраф от 30 000 ₽');
    expect(card).toHaveTextContent('+ лишение права управления');
  });
});

describe('a point with its list (ФСО 5.1)', () => {
  it("is found by a sub-point's number, shows the list, and pins it", async () => {
    const { platform, user } = await renderApp();
    await open(user, 'уфсо 5.1.3');
    const point = screen.getByRole('article', { name: 'Пункт 5.1' });
    expect(point).toHaveTextContent('5.1.3. Строгий выговор. Основания: Систематические нарушения, игнорирование прямых приказов.');

    await pinArticle(user);
    expect(pinnedCards(platform)[0].heading).toMatch(/^Регламент п. 5.1. За нарушение/);
    expect(pinnedCards(platform)[0].lines).toHaveLength(7);
    expect(pinnedCards(platform)[0].lines[1]).toBe('5.1.1. Замечание (устное). Основания: Мелкое нарушение, совершённое впервые. Выносит: Командир подразделения.');
  });
});

describe('pinning the calculator', () => {
  it('pins the total, the charges and the КоАП total, and follows the calculator', async () => {
    const { platform, user } = await renderApp();
    await add(user, 'ук 65 ч 1');
    await add(user, 'коап 8.6 ч 1');
    await pinCalculator(user);

    expect(platform.state.overlayVisible).toBe(false);
    expect(pinnedCards(platform)).toEqual<PinCard[]>([
      {
        id: 'calculator',
        kind: 'calculator',
        heading: '30 мес',
        stars: 3,
        lines: ['ст. 65 ч. 1 УК; ст. 8.6 ч. 1 КоАП', 'КоАП: штраф 10 000 ₽'],
      },
    ]);

    await add(user, 'ук 88 ч 1');
    expect(pinnedCards(platform)[0]).toMatchObject({
      heading: '40 мес',
      stars: 4,
      warning: 'ст. 88 ч. 1 — федеральная подследственность — дело ФСБ',
    });

    await user.click(within(panel()).getByRole('button', { name: 'Очистить' }));
    expect(pinnedCards(platform)).toEqual([]);
  });

  it('shows the fine when the officer picked one, and the КоАП total when there is no УК', async () => {
    const { platform, user } = await renderApp();
    await add(user, 'коап 5.4 ч 1');
    await user.click(within(panel()).getByRole('radio', { name: 'арест' }));
    await pinCalculator(user);
    expect(pinnedCards(platform)[0]).toMatchObject({ heading: 'арест 20 сут', stars: 2, lines: ['ст. 5.4 ч. 1 КоАП'] });

    await add(user, 'ук 57');
    await user.click(within(panel()).getByRole('radio', { name: 'Штраф' }));
    expect(pinnedCards(platform)[0].heading).toBe('Штраф до 100 000 ₽');
    await user.type(within(panel()).getByRole('textbox', { name: 'Сумма штрафа' }), '50000');
    expect(pinnedCards(platform)[0].heading).toBe('Штраф 50 000 ₽');

    // The same button takes the total off again.
    await user.click(within(panel()).getByRole('button', { name: 'Открепить итог' }));
    expect(pinnedCards(platform)).toEqual([]);
  });
});

describe('several cards at once', () => {
  it('pins each one beside the others, and keeps the articles for the next launch', async () => {
    const { platform, user } = await renderApp();
    await open(user, 'ук 65 ч 1');
    await pinArticle(user);
    await open(user, 'ук 104');
    await pinArticle(user);
    await add(user, 'ук 88 ч 1');
    await pinCalculator(user);

    expect(pinnedCards(platform).map((card) => card.kind)).toEqual(['article', 'article', 'calculator']);
    // Each block is put beside the ones already there, so none hides another.
    const places = platform.state.pins.map((group) => `${group.x},${group.y}`);
    expect(new Set(places).size).toBe(3);

    // Saved without the calculator, whose detention is over by the next launch.
    const saved = platform.settings.get('pins:tverskoi') as PinGroup[];
    expect(saved.flatMap((group) => group.cards).map((card) => card.kind)).toEqual(['article', 'article']);
  });

  it('takes back what the user did on the cards themselves and saves it', async () => {
    const { platform, user } = await renderApp();
    await open(user, 'ук 65 ч 1');
    await pinArticle(user);

    const moved = platform.state.pins.map((group) => ({ ...group, x: 700, y: 120 }));
    await act(async () => platform.changePins(moved));
    expect(platform.settings.get('pins:tverskoi')).toEqual(moved);

    await act(async () => platform.changePins([]));
    expect(pinnedCards(platform)).toEqual([]);
    // The article says it is not pinned any more.
    expect(within(screen.getByRole('article')).getByRole('button', { name: 'Закрепить' })).toBeInTheDocument();
  });

  it('brings the saved cards back on the next launch', async () => {
    const saved: PinGroup[] = [
      { id: 'uk-65#1', x: 100, y: 200, cards: [{ id: 'uk-65#1', kind: 'article', heading: 'УК ст. 65 ч. 1. Кража', lines: ['Кража'] }] },
      { id: 'calculator', x: 300, y: 400, cards: [{ id: 'calculator', kind: 'calculator', heading: '30 мес', lines: [] }] },
    ];
    const { platform } = await renderApp({ settings: { 'pins:tverskoi': saved } });
    await vi.waitFor(() => expect(platform.state.pins.length).toBe(1));
    expect(pinnedCards(platform)[0].heading).toBe('УК ст. 65 ч. 1. Кража');
  });
});

/** In jsdom nothing is laid out: the blocks are where their style says, each of this size. */
const BLOCK = { width: 380, height: 120 };
function layOut() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains('pin-surface')) return { left: 0, top: 0, width: 1600, height: 900 } as DOMRect;
    const block = this.closest('.pin') as HTMLElement | null;
    if (!block) return { left: 0, top: 0, width: 0, height: 0 } as DOMRect;
    const left = parseFloat(block.style.left) || 0;
    const top = parseFloat(block.style.top) || 0;
    if (this === block) {
      const height = BLOCK.height * block.querySelectorAll('.pin__card').length;
      return { left, top, right: left + BLOCK.width, bottom: top + height, width: BLOCK.width, height } as DOMRect;
    }
    const index = [...block.querySelectorAll('.pin__card')].indexOf(this.closest('.pin__card')!);
    const cardTop = top + BLOCK.height * Math.max(index, 0);
    return { left, top: cardTop, right: left + BLOCK.width, bottom: cardTop + BLOCK.height, width: BLOCK.width, height: BLOCK.height } as DOMRect;
  });
}

const card = (id: string, heading: string): PinCard => ({ id, kind: 'article', heading, punishment: [{ text: 'штраф до 50 000 ₽' }], lines: [`Текст ${id}`] });
const block = (id: string, x: number, y: number, ...cards: PinCard[]): PinGroup => ({ id, x, y, cards });

/** Drags from one point to another with the mouse, over the whole window. */
async function drag(from: HTMLElement, at: [number, number], to: [number, number]) {
  const user = userEvent.setup();
  await user.pointer([
    { target: from, coords: { clientX: at[0], clientY: at[1] }, keys: '[MouseLeft>]' },
    { target: document.body, coords: { clientX: to[0], clientY: to[1] } },
    { target: document.body, coords: { clientX: to[0], clientY: to[1] }, keys: '[/MouseLeft]' },
  ]);
}

const head = (group: HTMLElement) => group.querySelector('.pin__head') as HTMLElement;

describe('the cards over the game', () => {
  it('shows the cross and the drag only while the overlay is open', () => {
    const groups = [block('a', 40, 300, card('a', 'УК ст. 104. Оскорбление'))];
    const { rerender } = render(<PinSurface groups={groups} live={false} onChange={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Открепить' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Закреплено' })).not.toHaveClass('pin--live');

    const onChange = vi.fn();
    rerender(<PinSurface groups={groups} live onChange={onChange} />);
    screen.getByRole('button', { name: 'Открепить' }).click();
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('moves a block to where it was dragged', async () => {
    layOut();
    const onChange = vi.fn();
    render(<PinSurface groups={[block('a', 40, 300, card('a', 'Кража'))]} live onChange={onChange} />);
    await drag(head(screen.getByRole('region', { name: 'Закреплено' })), [60, 310], [560, 410]);

    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ id: 'a', x: 540, y: 400 })]);
    vi.restoreAllMocks();
  });

  it('joins two blocks when one is dropped onto the other, and takes a card back out of the block', async () => {
    layOut();
    const onChange = vi.fn();
    render(<PinSurface groups={[block('a', 40, 300, card('a', 'Кража')), block('b', 500, 300, card('b', 'Халатность'))]} live onChange={onChange} />);

    // Dropped on the lower half of the other block, the cards go under its own.
    await drag(head(screen.getAllByRole('region', { name: 'Закреплено' })[0]), [60, 310], [690, 410]);
    const joined = onChange.mock.calls.at(-1)![0] as PinGroup[];
    expect(joined).toHaveLength(1);
    expect(joined[0].cards.map((c) => c.heading)).toEqual(['Халатность', 'Кража']);

    // The joined block shows how many cards it holds, and each keeps its own cross.
    onChange.mockClear();
    render(<PinSurface groups={joined} live onChange={onChange} />);
    const stack = screen.getByRole('region', { name: 'Закреплено: 2' });
    expect(within(stack).getByRole('button', { name: 'Открепить всё' })).toBeInTheDocument();
    expect(within(stack).getByRole('button', { name: 'Открепить: Кража' })).toBeInTheDocument();

    // A card dragged out of the block becomes a block of its own again.
    const second = stack.querySelectorAll('.pin__card')[1] as HTMLElement;
    await drag(second.querySelector('.pin__head') as HTMLElement, [520, 440], [900, 640]);
    const split = onChange.mock.calls.at(-1)![0] as PinGroup[];
    expect(split.map((group) => group.cards.map((c) => c.heading))).toEqual([['Халатность'], ['Кража']]);
    expect(split[1]).toMatchObject({ x: 880, y: 620 });
    vi.restoreAllMocks();
  });

  it('takes the size its corner is dragged to, and then scrolls the text instead of cutting it', async () => {
    layOut();
    const onChange = vi.fn();
    render(<PinSurface groups={[block('a', 40, 300, card('a', 'Кража'))]} live onChange={onChange} />);
    const corner = screen.getByRole('button', { name: 'Изменить размер' });
    await drag(corner, [420, 420], [560, 620]);

    const sized = onChange.mock.calls.at(-1)![0] as PinGroup[];
    // The block was 380 × 120 where it was laid out; the corner went 140 right and 200 down.
    expect(sized[0]).toMatchObject({ width: 520, height: 320 });

    onChange.mockClear();
    render(<PinSurface groups={sized} live onChange={onChange} />);
    const block2 = screen.getAllByRole('region', { name: 'Закреплено' }).at(-1)!;
    expect(block2).toHaveClass('pin--sized');
    expect(block2).toHaveStyle({ width: '520px', height: '320px' });
    vi.restoreAllMocks();
  });

  it('puts the cards on the side the mouse dropped them on', async () => {
    layOut();
    const onChange = vi.fn();
    render(<PinSurface groups={[block('a', 40, 300, card('a', 'Кража')), block('b', 500, 300, card('b', 'Халатность'))]} live onChange={onChange} />);

    // Nearest the left edge of the other block: beside it, and first.
    await drag(head(screen.getAllByRole('region', { name: 'Закреплено' })[0]), [60, 310], [530, 350]);
    const joined = (onChange.mock.calls.at(-1)![0] as PinGroup[])[0];
    expect(joined.flow).toBe('row');
    expect(joined.cards.map((c) => c.heading)).toEqual(['Кража', 'Халатность']);
    vi.restoreAllMocks();
  });

  it('flips through the cards of a block one at a time', async () => {
    const onChange = vi.fn();
    const stack = [block('a', 40, 300, card('a', 'Кража'), card('b', 'Халатность'), card('c', 'Разбой'))];
    const { rerender } = render(<PinSurface groups={stack} live onChange={onChange} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Листать по одной' }));
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ paged: true })]);

    rerender(<PinSurface groups={onChange.mock.calls.at(-1)![0] as PinGroup[]} live onChange={onChange} />);
    const shown = () => [...document.querySelectorAll('.pin__title')].map((el) => el.textContent);
    expect(shown()).toEqual(['Кража']);
    expect(screen.getByText('1 / 3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Следующая карточка' }));
    expect(shown()).toEqual(['Халатность']);
    // Back past the first card it comes round to the last.
    await user.click(screen.getByRole('button', { name: 'Предыдущая карточка' }));
    await user.click(screen.getByRole('button', { name: 'Предыдущая карточка' }));
    expect(shown()).toEqual(['Разбой']);
    expect(screen.getByText('3 / 3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Показать все карточки' }));
    expect(onChange.mock.calls.at(-1)![0][0].paged).toBe(false);
  });

  it('in its own window takes what was pinned before it loaded, and tells the overlay what changed', async () => {
    const groups = [block('a', 40, 300, card('a', 'УК ст. 104. Оскорбление'))];
    let sendGroups: (groups: PinGroup[]) => void = () => {};
    let sendLive: (live: boolean) => void = () => {};
    const bridge: PinBridge = {
      state: async () => ({ groups, live: false }),
      onGroups: (listener) => ((sendGroups = listener), () => {}),
      onLive: (listener) => ((sendLive = listener), () => {}),
      layout: vi.fn(async () => {}),
      areas: vi.fn(async () => {}),
      onToast: () => () => {},
      toastDone: vi.fn(async () => {}),
    };
    render(<PinWindow bridge={bridge} />);
    expect(await screen.findByText('УК ст. 104. Оскорбление')).toBeInTheDocument();
    // The window tells the native side where the cards are: everywhere else it lets the mouse through.
    expect(bridge.areas).toHaveBeenCalled();

    act(() => sendGroups([block('b', 40, 300, { id: 'calculator', kind: 'calculator', heading: '40 мес', stars: 4, lines: ['ст. 88 ч. 1 УК'] })]));
    expect(screen.getByText('40 мес')).toBeInTheDocument();

    act(() => sendLive(true));
    await userEvent.click(screen.getByRole('button', { name: 'Открепить' }));
    expect(bridge.layout).toHaveBeenCalledWith([]);
    expect(screen.queryByRole('region', { name: 'Закреплено' })).not.toBeInTheDocument();
  });
});

describe('a notice over the game', () => {
  it('shows at the top right and goes by itself after a few seconds', () => {
    vi.useFakeTimers();
    const onToastEnd = vi.fn();
    render(
      <PinSurface groups={[]} live={false} onChange={() => {}} toast={{ id: 't', title: 'Вышло обновление РО Хелпер', text: 'Версия 1.1.0.' }} onToastEnd={onToastEnd} />,
    );
    const notice = () => screen.getByRole('status', { name: 'Уведомление' });
    expect(notice()).toHaveTextContent('Вышло обновление РО ХелперВерсия 1.1.0.');
    expect(notice()).toHaveStyle({ top: '16px', right: '16px' });

    act(() => void vi.advanceTimersByTime(TOAST_MS - 100));
    expect(notice()).not.toHaveClass('toast--leave');
    act(() => void vi.advanceTimersByTime(100));
    expect(notice()).toHaveClass('toast--leave');
    act(() => void vi.advanceTimersByTime(300));
    expect(onToastEnd).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('goes at once when clicked', () => {
    vi.useFakeTimers();
    const onToastEnd = vi.fn();
    render(<PinSurface groups={[]} live onChange={() => {}} toast={{ id: 't', title: 'Вышло обновление' }} onToastEnd={onToastEnd} />);
    act(() => screen.getByRole('status', { name: 'Уведомление' }).click());
    act(() => void vi.advanceTimersByTime(300));
    expect(onToastEnd).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
