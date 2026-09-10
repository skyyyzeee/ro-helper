import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/renderApp';

const search = () => screen.getByRole('searchbox', { name: 'Поиск по законам' });
const panel = () => screen.getByRole('complementary', { name: 'Калькулятор' });
const queryPanel = () => screen.queryByRole('complementary', { name: 'Калькулятор' });
const inCalculator = () => within(screen.getByRole('list', { name: 'Статьи в калькуляторе' })).getAllByRole('listitem');
const total = () => within(panel()).getByLabelText('Итог');

async function find(user: Awaited<ReturnType<typeof renderApp>>['user'], query: string) {
  await user.clear(search());
  await user.type(search(), query);
}

describe('criminal calculator', () => {
  it('opens beside the results with the first charge, marks it in the results and closes when emptied', async () => {
    const { platform, user } = await renderApp();
    await find(user, 'ук 65');
    expect(queryPanel()).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Добавить ст. 65 ч. 1 в калькулятор' }));
    expect(panel()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Убрать ст. 65 ч. 1 из калькулятора' })).toHaveAttribute('aria-pressed', 'true');
    expect(platform.calls.some((c) => c.method === 'extendWindow')).toBe(true);
    expect(total()).toHaveTextContent('30 мес');
    expect(within(total()).getByRole('img', { name: 'Звёзд розыска: 3' })).toBeInTheDocument();
    expect(panel()).toHaveTextContent('Залог(средней тяжести)75 000 ₽');

    await user.click(within(panel()).getByRole('button', { name: 'Убрать ст. 65 ч. 1' }));
    expect(queryPanel()).not.toBeInTheDocument();
    expect(platform.calls.at(-1)?.method).toBe('retractWindow');
  });

  it('adds the selected result with Enter and takes it out with Enter again', async () => {
    const { user } = await renderApp();
    await find(user, 'ук 65');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(inCalculator()).toHaveLength(1);
    expect(inCalculator()[0]).toHaveTextContent('ст. 65 ч. 2');
    await user.keyboard('{Enter}');
    expect(queryPanel()).not.toBeInTheDocument();
  });

  it('shows absorption, the stars to set and the federal warning; «Очистить» empties it', async () => {
    const { user } = await renderApp();
    await find(user, 'ук 65 ч 1');
    await user.keyboard('{Enter}');
    await find(user, 'ук 88 ч 1');
    await user.keyboard('{Enter}');

    expect(total()).toHaveTextContent('40 мес');
    expect(within(total()).getByRole('img', { name: 'Звёзд розыска: 4' })).toBeInTheDocument();
    expect(panel()).toHaveTextContent('ст. 88 ч. 1 поглощает ст. 65 ч. 1 — УК ст. 41 ч. 2');
    expect(within(panel()).getByRole('alert')).toHaveTextContent('ст. 88 ч. 1 — федеральная подследственность — дело ФСБ');
    expect(panel()).toHaveTextContent('Залог(тяжкое)не предусмотрен');
    expect(inCalculator()[0]).toHaveClass('ci--absorbed');

    await user.click(within(panel()).getByRole('button', { name: 'Очистить' }));
    expect(queryPanel()).not.toBeInTheDocument();
  });

  it('reduces a charge for an attempt', async () => {
    const { user } = await renderApp();
    await find(user, 'ук 65 ч 1');
    await user.keyboard('{Enter}');
    await user.click(within(panel()).getByRole('button', { name: 'покушение' }));
    expect(total()).toHaveTextContent('22 мес');
    expect(total()).toHaveTextContent('= 20 мес');
    expect(panel()).toHaveTextContent('ст. 65 ч. 1: покушение — не более ¾ наказания, УК ст. 45 ч. 3');
  });

  it('switches to a fine, checks the amount against the limit, and refuses a fine when a charge has none', async () => {
    const { user } = await renderApp();
    await find(user, 'ук 57');
    await user.keyboard('{Enter}');
    await user.click(within(panel()).getByRole('radio', { name: 'Штраф' }));

    const amount = within(panel()).getByRole('textbox', { name: 'Сумма штрафа' });
    expect(total()).toHaveTextContent('от 25 000 до 100 000 ₽');
    await user.type(amount, '150000');
    expect(within(total()).getByRole('alert')).toHaveTextContent('Вне предела: от 25 000 до 100 000 ₽');
    await user.clear(amount);
    await user.type(amount, '50000');
    expect(within(total()).queryByRole('alert')).not.toBeInTheDocument();

    await find(user, 'ук 88 ч 2');
    await user.keyboard('{Enter}');
    expect(within(panel()).getByRole('radio', { name: 'Штраф' })).toBeDisabled();
    expect(within(panel()).getByRole('radio', { name: 'КПЗ' })).toHaveAttribute('aria-checked', 'true');
    expect(panel()).toHaveTextContent('Штраф недоступен: у ст. 88 ч. 2 нет штрафа');
  });

  it('offers articles of both codes, and nothing without a punishment', async () => {
    const { user } = await renderApp();
    await find(user, 'коап 8.6');
    expect(screen.getByRole('button', { name: 'Добавить ст. 8.6 ч. 1 в калькулятор' })).toBeInTheDocument();
    await find(user, 'пдд 2.1');
    expect(screen.queryByRole('button', { name: /в калькулятор$/ })).not.toBeInTheDocument();
  });
});

const adminPanel = () => within(panel()).getByRole('list', { name: 'Статьи КоАП в калькуляторе' });
const adminTotal = () => within(panel()).getByLabelText('Итог КоАП');
const copyButton = () => within(panel()).getByRole('button', { name: /^(Скопировать|Скопировано|Не удалось скопировать)$/ });

async function add(user: Awaited<ReturnType<typeof renderApp>>['user'], query: string) {
  await find(user, query);
  await user.keyboard('{Enter}');
}

describe('administrative charges', () => {
  it('adds up the fines at their limits, without the КПЗ / Штраф switch, and checks a typed one', async () => {
    const { user } = await renderApp();
    await add(user, 'коап 8.6 ч 1');
    await add(user, 'коап 8.2 ч 2');

    expect(within(panel()).queryByRole('radio', { name: 'КПЗ' })).not.toBeInTheDocument();
    expect(panel()).toHaveTextContent('КоАП · сложение');
    expect(within(adminTotal()).getByText('28 000 ₽')).toBeInTheDocument();
    expect(panel()).toHaveTextContent('Наказание назначается за каждое нарушение и складывается — КоАП ст. 4.5');

    const amount = within(adminPanel()).getByRole('textbox', { name: 'Сумма штрафа по ст. 8.2 ч. 2' });
    await user.type(amount, '20000');
    expect(within(adminPanel()).getByRole('alert')).toHaveTextContent('Вне предела: от 5 000 до 18 000 ₽');
    await user.clear(amount);
    await user.type(amount, '6000');
    expect(within(adminPanel()).queryByRole('alert')).not.toBeInTheDocument();
    expect(within(adminTotal()).getByText('16 000 ₽')).toBeInTheDocument();
  });

  it('switches the limits between a citizen and an official', async () => {
    const { user } = await renderApp();
    await add(user, 'коап 5.4 ч 1');
    expect(adminPanel()).toHaveTextContent('от 10 000 до 25 000 ₽');
    await user.click(within(panel()).getByRole('radio', { name: 'должн. лицо' }));
    expect(adminPanel()).toHaveTextContent('от 30 000 до 50 000 ₽');
    expect(within(adminTotal()).getByText('50 000 ₽')).toBeInTheDocument();
  });

  it('counts an arrest with its bail and stars when the officer picks it', async () => {
    const { user } = await renderApp();
    await add(user, 'коап 5.4 ч 1');
    await user.click(within(adminPanel()).getByRole('radio', { name: 'арест' }));

    expect(within(adminPanel()).getByRole('textbox', { name: 'Срок ареста по ст. 5.4 ч. 1' })).toHaveAttribute('placeholder', '20');
    expect(adminTotal()).toHaveTextContent('Арест20 сут');
    expect(within(adminTotal()).getByRole('img', { name: 'Звёзд розыска: 2' })).toBeInTheDocument();
    expect(panel()).toHaveTextContent('Залог за арест(20 сут × 4 000 ₽)80 000 ₽');
  });

  it('keeps an article that does not punish the offender out of the total and the charges', async () => {
    const { user } = await renderApp();
    await add(user, 'коап 5.5');
    expect(adminPanel()).toHaveTextContent('гражданину не назначается');
    expect(within(panel()).queryByLabelText('Итог КоАП')).not.toBeInTheDocument();
    expect(panel()).toHaveTextContent('Обвинять не в чем');
    expect(copyButton()).toBeDisabled();
  });

  it('starts a new detention from the defaults once emptied', async () => {
    const { user } = await renderApp();
    await add(user, 'коап 5.4 ч 1');
    await user.click(within(panel()).getByRole('radio', { name: 'должн. лицо' }));
    await user.click(within(panel()).getByRole('button', { name: 'Очистить' }));
    await add(user, 'коап 5.4 ч 1');
    expect(within(panel()).getByRole('radio', { name: 'гражданин' })).toHaveAttribute('aria-checked', 'true');
  });
});

describe('copying the charges', () => {
  it('goes hotkey → number → Enter → Ctrl+C → Esc without the mouse', async () => {
    const { platform, user } = await renderApp();
    await user.type(search(), '65');
    await user.keyboard('{Enter}');
    await user.keyboard('{Control>}c{/Control}');

    expect(platform.state.clipboard).toBe('ст. 65 ч. 1 УК');
    expect(copyButton()).toHaveTextContent('Скопировано');
    // The calculator stays for the pinned card; Esc clears the search, then hides the overlay.
    await user.keyboard('{Escape}{Escape}');
    expect(panel()).toBeInTheDocument();
    expect(platform.state.overlayVisible).toBe(false);
  });

  it('writes both codes in one line with the button', async () => {
    const { platform, user } = await renderApp();
    await add(user, 'коап 8.6 ч 1');
    await add(user, 'ук 88 ч 1');
    await add(user, 'ук 65 ч 1');
    await user.click(within(panel()).getAllByRole('button', { name: 'покушение' })[1]);
    expect(panel()).toHaveTextContent('ст. 65 ч. 1 (покушение), 88 ч. 1 УК; ст. 8.6 ч. 1 КоАП');
    await user.click(copyButton());
    expect(platform.state.clipboard).toBe('ст. 65 ч. 1 (покушение), 88 ч. 1 УК; ст. 8.6 ч. 1 КоАП');
  });

  it('leaves Ctrl+C to selected text, and says when the clipboard fails', async () => {
    const { platform, user } = await renderApp();
    await add(user, 'ук 65 ч 1');
    (search() as HTMLInputElement).setSelectionRange(0, 2);
    await user.keyboard('{Control>}c{/Control}');
    expect(platform.calls.some((c) => c.method === 'writeClipboard')).toBe(false);

    platform.writeClipboard = async () => {
      throw new Error('clipboard is busy');
    };
    await user.click(copyButton());
    expect(copyButton()).toHaveTextContent('Не удалось скопировать');
  });
});
