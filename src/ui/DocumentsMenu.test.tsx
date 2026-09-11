import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/renderApp';

type User = Awaited<ReturnType<typeof renderApp>>['user'];

const search = () => screen.getByRole('searchbox', { name: 'Поиск по законам' });
const menu = () => screen.getByRole('dialog', { name: 'Все документы' });
const queryMenu = () => screen.queryByRole('dialog', { name: 'Все документы' });
const filter = () => within(menu()).getByRole('textbox', { name: 'Фильтр документов' });
const groups = () => within(menu()).getAllByRole('group').filter((g) => g.getAttribute('aria-label') !== 'Виды документов');
const documentRows = () => within(menu()).getAllByRole('button').filter((b) => b.classList.contains('doc-row'));
const results = () => within(screen.getByRole('list', { name: 'Результаты поиска' })).getAllByRole('listitem');

async function openMenu(user: User) {
  await user.click(screen.getByRole('button', { name: 'Все документы' }));
}

async function pick(user: User, name: RegExp) {
  await openMenu(user);
  await user.click(within(menu()).getAllByRole('button', { name })[0]);
}

describe('documents menu', () => {
  it('lists the server’s documents by kind with their article counts, the filter taking the cursor', async () => {
    const { user } = await renderApp();
    await openMenu(user);
    expect(filter()).toHaveFocus();
    expect(groups().map((g) => g.getAttribute('aria-label'))).toEqual(['Кодексы и Конституция']);
    expect(documentRows().map((row) => row.textContent)).toEqual([
      'УКУголовный кодекс117',
      'КоАПКодекс об административных правонарушениях136',
      'ПДДПравила дорожного движения (15-ФЗ)116',
    ]);
    // Tags only for the kinds the laws have so far.
    expect(within(within(menu()).getByRole('group', { name: 'Виды документов' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['Все', 'Кодексы']);
  });

  it('puts the organisation’s documents first, in its order', async () => {
    const { user } = await renderApp({ profile: { organization: 'gibdd' } });
    await openMenu(user);
    const [own] = groups();
    expect(own).toHaveAccessibleName('ГИБДД · ваша организация');
    expect(within(own).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'ПДДПравила дорожного движения (15-ФЗ)116',
      'КоАПКодекс об административных правонарушениях136',
    ]);

    // With a filter or a tag the list is by kind only.
    await user.type(filter(), 'кодекс');
    expect(groups().map((g) => g.getAttribute('aria-label'))).toEqual(['Кодексы и Конституция']);
  });

  it('has no organisation group when none of its documents are in the laws yet', async () => {
    const { user } = await renderApp({ profile: { organization: 'mvd' } });
    await openMenu(user);
    expect(groups().map((g) => g.getAttribute('aria-label'))).toEqual(['Кодексы и Конституция']);
  });

  it('filters by name or badge', async () => {
    const { user } = await renderApp();
    await openMenu(user);
    await user.type(filter(), 'коап');
    expect(documentRows()).toHaveLength(1);
    await user.clear(filter());
    await user.type(filter(), 'дорожн');
    expect(documentRows().map((row) => row.textContent)).toEqual(['ПДДПравила дорожного движения (15-ФЗ)116']);
    await user.clear(filter());
    await user.type(filter(), 'устав');
    expect(within(menu()).getByText('Ничего не найдено')).toBeInTheDocument();
  });

  it('closes with Esc, the cross or the dimmed background, handing the cursor back to the search', async () => {
    const { user } = await renderApp();
    await openMenu(user);
    await user.keyboard('{Escape}');
    expect(queryMenu()).not.toBeInTheDocument();
    expect(search()).toHaveFocus();

    await openMenu(user);
    await user.click(within(menu()).getByRole('button', { name: 'Закрыть меню' }));
    expect(queryMenu()).not.toBeInTheDocument();

    await openMenu(user);
    await user.click(document.querySelector('.scrim')!);
    expect(queryMenu()).not.toBeInTheDocument();
  });

  it('reopens on the current document: one row filled and outlined, the mouse moving the fill', async () => {
    const { user } = await renderApp({ profile: { organization: 'gibdd' } });
    await pick(user, /^КоАП/);
    await openMenu(user);
    const selected = () => documentRows().filter((row) => row.classList.contains('doc-row--selected'));
    const current = () => documentRows().filter((row) => row.getAttribute('aria-current') === 'true');
    expect(selected()).toHaveLength(1);
    expect(current()).toEqual(selected());
    expect(selected()[0]).toHaveTextContent('КоАП');

    await user.hover(documentRows()[2]);
    expect(selected()).toEqual([documentRows()[2]]);
    await user.keyboard('{ArrowDown}{Enter}');
    expect(screen.getByRole('button', { name: /только в КоАП/ })).toBeInTheDocument(); // row 3 of «Кодексы»: КоАП
  });

  it('picks a document with ↓ and Enter', async () => {
    const { user } = await renderApp();
    await openMenu(user);
    await user.keyboard('{ArrowDown}{Enter}');
    expect(queryMenu()).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /только в КоАП/ })).toBeInTheDocument();
    expect(search()).toHaveFocus();
  });
});

describe('searching one document', () => {
  it('shows its table of contents by chapter, and ↑↓ and → go through it', async () => {
    const { user } = await renderApp();
    await pick(user, /^УКУголовный кодекс/);

    expect(search()).toHaveAttribute('placeholder', 'Поиск: Уголовный кодекс');
    expect(screen.getByText('117 статей')).toBeInTheDocument();
    const toc = screen.getByLabelText('Оглавление: Уголовный кодекс');
    const [first] = within(toc).getAllByRole('region');
    expect(within(first).getByRole('heading')).toHaveTextContent('Глава 1. Задачи и принципы Уголовного кодекса РО');
    expect(within(toc).getAllByRole('region', { name: /^Глава / }).length).toBeGreaterThan(10);

    await user.keyboard('{ArrowDown}{ArrowRight}');
    expect(screen.getByRole('article')).toHaveAccessibleName(/^Статья 2\. /);
    await user.click(screen.getByRole('button', { name: 'Оглавление' }));
    expect(screen.getByLabelText('Оглавление: Уголовный кодекс')).toBeInTheDocument();
  });

  it('searches only in it, unless the query names another code', async () => {
    const { user } = await renderApp();
    await pick(user, /^КоАП/);
    await user.type(search(), '8');
    expect(new Set(results().map((row) => row.textContent?.slice(0, 4)))).toEqual(new Set(['КоАП']));
    expect(screen.getByText('Кодекс об административных правонарушениях')).toBeInTheDocument();

    await user.clear(search());
    await user.type(search(), 'ук 65');
    expect(results()[0]).toHaveTextContent('УКст. 65 ч. 1');
  });

  it('steps back with Esc: the query, then the document', async () => {
    const { user } = await renderApp();
    await pick(user, /^КоАП/);
    await user.type(search(), '8.6');
    await user.keyboard('{Escape}');
    expect(search()).toHaveValue('');
    expect(screen.getByLabelText('Оглавление: Кодекс об административных правонарушениях')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: /только в КоАП/ })).not.toBeInTheDocument();
    expect(screen.getByText('Здесь появятся избранные и недавние статьи')).toBeInTheDocument();
  });

  it('takes the document off with Backspace in an empty field or with its cross', async () => {
    const { user } = await renderApp();
    await pick(user, /^ПДД/);
    await user.keyboard('{Backspace}');
    expect(screen.queryByRole('button', { name: /только в ПДД/ })).not.toBeInTheDocument();

    await pick(user, /^ПДД/);
    await user.click(screen.getByRole('button', { name: /только в ПДД/ }));
    expect(search()).toHaveAttribute('placeholder', 'Номер или слова: 65, коап 8.6, кража');
  });
});
