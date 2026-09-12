import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { pinnedCards, renderApp } from '../test/renderApp';

type User = Awaited<ReturnType<typeof renderApp>>['user'];

const search = () => screen.getByRole('searchbox', { name: 'Поиск по законам' });
const list = (name: string) => within(screen.getByRole('list', { name })).getAllByRole('listitem');
const article = () => screen.getByRole('article');
const panel = () => screen.queryByRole('complementary', { name: 'Калькулятор' });
const inCalculator = () => within(screen.getByRole('list', { name: 'Статьи в калькуляторе' })).getAllByRole('listitem');
const selectedRow = () => screen.getAllByRole('listitem').find((item) => item.querySelector('[aria-current="true"]'));

async function openFromSearch(user: User, query: string) {
  await user.clear(search());
  await user.type(search(), query);
  await user.keyboard('{ArrowRight}');
}

describe('an open article', () => {
  it('spells out the jurisdiction and the term the stars stand for', async () => {
    const { user } = await renderApp();
    await openFromSearch(user, 'ук 65 ч 1');
    const part = within(article()).getByRole('region', { name: 'Часть 1' });
    expect(part).toHaveTextContent('Р/Фрегиональная или федеральная');
    expect(part).toHaveTextContent('= 30 мес');

    await openFromSearch(user, 'ук 88 ч 1');
    expect(within(article()).getByRole('region', { name: 'Часть 1' })).toHaveTextContent('федеральная (ФСБ)');
  });

  it('calls КоАП stars the wanted level for an arrest, not a term in months', async () => {
    const { user } = await renderApp();
    await openFromSearch(user, 'коап 5.4 ч 1');
    const koap = within(article()).getByRole('region', { name: 'Часть 1' });
    expect(koap).toHaveTextContent('уровень розыска');
    expect(koap).not.toHaveTextContent('мес');
  });

  it('adds the part it was opened on, each part with its own «+», and Enter does the same', async () => {
    const { user } = await renderApp();
    await user.type(search(), 'ук 65');
    await user.keyboard('{ArrowDown}{ArrowRight}');
    expect(within(article()).getByRole('region', { name: 'Часть 2' })).toHaveAttribute('aria-current', 'true');

    const part = (n: number) => within(article()).getByRole('region', { name: `Часть ${n}` });
    await user.click(within(article()).getByText('Добавить ч. 2 в калькулятор'));
    expect(inCalculator()[0]).toHaveTextContent('ст. 65 ч. 2');
    expect(within(part(2)).getByRole('button', { name: 'Убрать ч. 2 из калькулятора' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(within(part(1)).getByRole('button', { name: 'Добавить ч. 1 в калькулятор' }));
    expect(inCalculator()).toHaveLength(2);

    await user.keyboard('{Enter}');
    expect(inCalculator()).toHaveLength(1);
    expect(inCalculator()[0]).toHaveTextContent('ст. 65 ч. 1');
  });

  it('has no calculator button for a law without punishments', async () => {
    const { user } = await renderApp();
    await openFromSearch(user, 'пдд 8.2');
    expect(within(article()).queryByRole('button', { name: /калькулятор/ })).not.toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(panel()).not.toBeInTheDocument();
  });

  it('pins its part with the punishment, the text and the jurisdiction warning', async () => {
    const { platform, user } = await renderApp();
    await openFromSearch(user, 'ук 88 ч 1');
    await user.click(within(article()).getByRole('button', { name: 'Закрепить' }));

    expect(pinnedCards(platform)[0]).toMatchObject({
      kind: 'article',
      heading: 'УК ст. 88 ч. 1. Халатность',
      punishment: [{ text: 'штраф от 60 000 до 80 000 ₽ либо 40 мес' }],
      warning: 'федеральная подследственность — дело ФСБ',
    });
    expect(pinnedCards(platform)[0].lines).toEqual([expect.stringMatching(/^Халатность, то есть/)]);

    // Another article is pinned beside the first, not instead of it.
    await openFromSearch(user, 'ук 104');
    await user.click(within(article()).getByRole('button', { name: 'Закрепить' }));
    expect(pinnedCards(platform).map((card) => card.heading)).toEqual([
      'УК ст. 88 ч. 1. Халатность',
      expect.stringMatching(/^УК ст\. 104\. /),
    ]);
    expect(pinnedCards(platform)[1].warning).toBeUndefined();

    // The same article again unpins it: the button says so.
    expect(within(article()).queryByRole('button', { name: 'Закрепить' })).not.toBeInTheDocument();
    await user.click(within(article()).getByRole('button', { name: 'Открепить' }));
    expect(pinnedCards(platform).map((card) => card.heading)).toEqual(['УК ст. 88 ч. 1. Халатность']);
  });

  it('opens with → only once the caret is at the end, and Esc goes back to the results', async () => {
    const { user } = await renderApp();
    await user.type(search(), 'ук 65');
    await user.keyboard('{ArrowLeft}{ArrowRight}');
    expect(screen.queryByRole('article')).not.toBeInTheDocument(); // the caret moved instead

    await user.keyboard('{ArrowRight}');
    expect(article()).toHaveAccessibleName('Статья 65. Кража');
    expect(within(article()).getByRole('button', { name: 'Результаты' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(list('Результаты поиска')).toHaveLength(2);
    expect(search()).toHaveValue('ук 65');
  });
});

describe('going back from an article', () => {
  it('leaves the list where it was scrolled to, and the article starts at its top', async () => {
    const { user } = await renderApp();
    await user.type(search(), 'штраф');
    const content = document.querySelector('.overlay__content')!;
    content.scrollTop = 640;
    fireEvent.scroll(content);

    await user.click(within(screen.getAllByRole('listitem')[5]).getAllByRole('button')[0]);
    expect(screen.getByRole('article')).toBeInTheDocument();
    expect(content.scrollTop).toBe(0);
    // Scrolling the article does not move the list's place.
    content.scrollTop = 200;
    fireEvent.scroll(content);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(content.scrollTop).toBe(640);
  });
});

describe('favourites and recent articles', () => {
  it('invites to add some while both lists are empty', async () => {
    await renderApp();
    expect(screen.getByText('Здесь появятся избранные и недавние статьи')).toBeInTheDocument();
  });

  it('shows favourites, then the recent articles without them, most recent first, and keeps them', async () => {
    const { platform, user } = await renderApp();
    await openFromSearch(user, 'ук 65 ч 1');
    await user.click(within(article()).getByRole('button', { name: 'В избранное' }));
    expect(within(article()).getByRole('button', { name: 'Убрать из избранного' })).toHaveAttribute('aria-pressed', 'true');

    await openFromSearch(user, 'ук 88 ч 1');
    await user.clear(search());
    await user.type(search(), 'коап 8.6 ч 1');
    await user.keyboard('{Enter}'); // added to the calculator counts as recent too
    await user.keyboard('{Escape}');

    expect(list('Избранное').map((row) => row.textContent)).toEqual([expect.stringContaining('ст. 65 ч. 1')]);
    const recent = list('Недавние');
    expect(recent).toHaveLength(2);
    expect(recent[0]).toHaveTextContent('ст. 8.6 ч. 1');
    expect(recent[1]).toHaveTextContent('ст. 88 ч. 1');

    expect(platform.settings.get('favorites:tverskoi')).toEqual(['uk-65#1']);
    expect(platform.settings.get('recent:tverskoi')).toEqual(['koap-8.6#1', 'uk-88#1', 'uk-65#1']);
  });

  it('walks both lists with ↑↓, adds with Enter and opens with →, going back to them', async () => {
    const { user } = await renderApp({
      settings: { 'favorites:tverskoi': ['uk-65#1'], 'recent:tverskoi': ['uk-88#1', 'uk-65#1', 'koap-8.6#1'] },
    });
    await screen.findByRole('list', { name: 'Избранное' });
    expect(list('Недавние')).toHaveLength(2);
    expect(selectedRow()).toHaveTextContent('ст. 65 ч. 1');

    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(selectedRow()).toHaveTextContent('ст. 8.6 ч. 1');
    await user.keyboard('{Enter}');
    expect(within(screen.getByRole('list', { name: 'Статьи КоАП в калькуляторе' })).getByRole('listitem')).toHaveTextContent('ст. 8.6 ч. 1');
    // Added, it moves to the top of the recent articles, and the selection goes with it.
    expect(list('Недавние')[0]).toHaveTextContent('ст. 8.6 ч. 1');
    expect(selectedRow()).toHaveTextContent('ст. 8.6 ч. 1');

    await user.keyboard('{ArrowDown}{ArrowRight}');
    expect(article()).toHaveAccessibleName('Статья 88. Халатность');
    await user.click(within(article()).getByRole('button', { name: 'Избранное и недавние' }));
    expect(list('Избранное')).toHaveLength(1);
  });

  it('drops saved articles the laws no longer have, and keeps the lists per server', async () => {
    const { platform } = await renderApp({
      settings: { 'favorites:tverskoi': ['uk-65#1', 'uk-999#', 'uk-65#7'], 'favorites:arbat': ['uk-88#1'] },
    });
    const favorites = await screen.findByRole('list', { name: 'Избранное' });
    expect(within(favorites).getAllByRole('listitem')).toHaveLength(1);
    expect(platform.calls.some((c) => c.method === 'readSetting' && c.args[0] === 'favorites:tverskoi')).toBe(true);
  });
});
