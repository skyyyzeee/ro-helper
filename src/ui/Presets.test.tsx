import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PinCard, PinGroup } from '../platform/types';
import { pinnedCards, renderApp } from '../test/renderApp';
import { PinSurface } from './PinSurface';

type User = Awaited<ReturnType<typeof renderApp>>['user'];

const search = () => screen.getByRole('searchbox', { name: 'Поиск по законам' });
const settings = () => screen.getByRole('group', { name: 'Настройки' });

async function pin(user: User, query: string) {
  await user.clear(search());
  await user.type(search(), query);
  await user.keyboard('{ArrowRight}');
  await user.click(within(screen.getByRole('article')).getByRole('button', { name: 'Закрепить' }));
}

describe('sets of pinned cards', () => {
  it('saves what is pinned as a set, and puts it back over the game with one button', async () => {
    const { platform, user } = await renderApp();
    await pin(user, 'ук 65 ч 1');
    await pin(user, 'ук 104');

    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    expect(settings()).toHaveTextContent('2 карточки');
    await user.type(within(settings()).getByRole('textbox', { name: 'Название набора' }), 'Патруль');
    await user.click(within(settings()).getByRole('button', { name: 'Сохранить набор' }));

    const list = within(settings()).getByRole('list', { name: 'Наборы закреплённых' });
    expect(list).toHaveTextContent('Патруль2 карточки');
    expect(platform.settings.get('pin-presets:tverskoi')).toEqual([expect.objectContaining({ name: 'Патруль' })]);

    await user.click(within(settings()).getByRole('button', { name: 'Открепить всё' }));
    expect(pinnedCards(platform)).toEqual([]);
    // With nothing pinned there is nothing to save.
    expect(within(settings()).getByRole('button', { name: 'Сохранить набор' })).toBeDisabled();

    await user.click(within(list).getByRole('button', { name: 'Показать набор «Патруль»' }));
    expect(pinnedCards(platform).map((card) => card.heading)).toEqual(['УК ст. 65 ч. 1. Кража', expect.stringMatching(/^УК ст\. 104\. /)]);

    await user.click(within(list).getByRole('button', { name: 'Удалить набор «Патруль»' }));
    expect(within(settings()).queryByRole('list', { name: 'Наборы закреплённых' })).not.toBeInTheDocument();
    expect(platform.settings.get('pin-presets:tverskoi')).toEqual([]);
  });

  it('names a set by itself when no name is given, and keeps the sets for the next launch', async () => {
    const { platform, user } = await renderApp();
    await pin(user, 'ук 65 ч 1');
    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    await user.click(within(settings()).getByRole('button', { name: 'Сохранить набор' }));
    expect(within(settings()).getByRole('list', { name: 'Наборы закреплённых' })).toHaveTextContent('Набор 1');

    const saved = platform.settings.get('pin-presets:tverskoi');
    document.body.innerHTML = '';
    const again = await renderApp({ settings: { 'pin-presets:tverskoi': saved } });
    await again.user.click(screen.getByRole('button', { name: 'Настройки' }));
    expect(await within(settings()).findByText('Набор 1')).toBeInTheDocument();
  });
});

describe('the compact card', () => {
  const card: PinCard = {
    id: 'a',
    kind: 'article',
    heading: 'УК ст. 65 ч. 1. Кража',
    punishment: [{ text: 'штраф до 50 000 ₽ либо 30 мес' }],
    extra: ['запись о судимости'],
    lines: ['Кража, то есть тайное хищение чужого имущества'],
    warning: 'федеральная подследственность',
  };

  it('shows only the heading, the punishment and the warning, and switches back', async () => {
    const onChange = vi.fn();
    const groups: PinGroup[] = [{ id: 'a', x: 0, y: 0, cards: [card] }];
    const { rerender } = render(<PinSurface groups={groups} live onChange={onChange} />);
    const block = () => screen.getByRole('region', { name: 'Закреплено' });
    expect(block()).toHaveTextContent('тайное хищение');

    await userEvent.click(screen.getByRole('button', { name: 'Компактный вид' }));
    const compact = onChange.mock.calls.at(-1)![0] as PinGroup[];
    expect(compact[0].compact).toBe(true);

    rerender(<PinSurface groups={compact} live onChange={onChange} />);
    expect(block()).toHaveTextContent('УК ст. 65 ч. 1. Кража');
    expect(block()).toHaveTextContent('штраф до 50 000 ₽ либо 30 мес');
    expect(block()).toHaveTextContent('федеральная подследственность');
    expect(block()).not.toHaveTextContent('тайное хищение');
    expect(block()).not.toHaveTextContent('запись о судимости');

    await userEvent.click(screen.getByRole('button', { name: 'Полный вид' }));
    expect((onChange.mock.calls.at(-1)![0] as PinGroup[])[0].compact).toBe(false);
  });

  it('is one switch for a whole block of several', () => {
    const groups: PinGroup[] = [{ id: 'a', x: 0, y: 0, cards: [card, { ...card, id: 'b', heading: 'УК ст. 104' }] }];
    render(<PinSurface groups={groups} live onChange={() => {}} />);
    expect(screen.getAllByRole('button', { name: 'Компактный вид' })).toHaveLength(1);
  });
});
