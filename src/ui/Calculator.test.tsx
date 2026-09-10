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

  it('offers only criminal-code articles', async () => {
    const { user } = await renderApp();
    await find(user, 'коап 8.6');
    expect(screen.queryByRole('button', { name: /в калькулятор$/ })).not.toBeInTheDocument();
  });
});
