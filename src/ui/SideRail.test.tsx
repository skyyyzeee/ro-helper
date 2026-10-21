import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/renderApp';

const rail = () => screen.getByRole('navigation', { name: 'Разделы' });
const lawTabs = () => screen.getByRole('group', { name: 'Законы' });
const LAWS = 'Законы: поиск, документы, калькулятор';
const SERVICE = 'Служба: отдел и памятки';

describe('the side column (variant Б)', () => {
  it('is always on screen: the server on top, five sections with their names, the settings and the player at the foot', async () => {
    await renderApp();
    const buttons = within(rail()).getAllByRole('button');
    expect(buttons[0]).toHaveAccessibleName('Сменить сервер или организацию');
    expect(buttons.slice(1).map((b) => b.getAttribute('aria-label'))).toEqual([LAWS, 'ИИ-разбор ситуации', SERVICE, 'Вики Russia Online', 'Над игрой: закреплённое, заметка', 'Настройки', 'Профиль']);
    expect(buttons.slice(1).map((b) => b.textContent)).toEqual(['Законы', 'ИИ', 'Служба', 'Вики', 'Над игрой', 'Настройки', 'Я']);
    expect(within(rail()).getByRole('button', { name: LAWS })).toHaveAttribute('aria-current', 'page');
    expect(within(lawTabs()).getByRole('button', { name: 'Поиск' })).toHaveAttribute('aria-current', 'page');
  });

  it('has the laws’ pages as tabs: the documents open and close there, the settings close them', async () => {
    const { user } = await renderApp();
    const documents = within(lawTabs()).getByRole('button', { name: 'Все документы' });
    await user.click(documents);
    expect(documents).toHaveAttribute('aria-expanded', 'true');
    expect(documents).toHaveAttribute('aria-current', 'page');
    await user.click(within(rail()).getByRole('button', { name: 'Настройки' }));
    expect(screen.getByRole('group', { name: 'Настройки' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Законы' })).not.toBeInTheDocument();
    await user.click(within(rail()).getByRole('button', { name: 'Настройки' }));
    expect(screen.queryByRole('group', { name: 'Настройки' })).not.toBeInTheDocument();
  });

  it('keeps the department and the memos together under «Служба»', async () => {
    const { user } = await renderApp();
    await user.click(within(rail()).getByRole('button', { name: SERVICE }));
    const tabs = screen.getByRole('group', { name: 'Служба' });
    expect(within(tabs).getByRole('button', { name: 'Отдел: порядок действий по закону' })).toHaveAttribute('aria-current', 'page');
    await user.click(within(tabs).getByRole('button', { name: 'Памятки' }));
    expect(within(screen.getByRole('group', { name: 'Служба' })).getByRole('button', { name: 'Памятки' })).toHaveAttribute('aria-current', 'page');
    expect(within(rail()).getByRole('button', { name: SERVICE })).toHaveAttribute('aria-current', 'page');
  });

  it('opens its sections and their tabs with Ctrl and a number, as before', async () => {
    const { user } = await renderApp();
    await user.keyboard('{Control>}2{/Control}');
    expect(within(lawTabs()).getByRole('button', { name: 'Все документы' })).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Control>}5{/Control}');
    expect(screen.getByRole('group', { name: 'Настройки' })).toBeInTheDocument();
    await user.keyboard('{Control>}1{/Control}');
    expect(within(rail()).getByRole('button', { name: LAWS })).toHaveAttribute('aria-current', 'page');
  });

  it('opens the choice of server and organisation from the server’s mark', async () => {
    const { user } = await renderApp();
    await user.click(within(rail()).getByRole('button', { name: 'Сменить сервер или организацию' }));
    expect(screen.getByRole('region', { name: 'Сервер и организация' })).toBeInTheDocument();
  });

  it('offers the calculator’s tab only once it has charges', async () => {
    await renderApp();
    expect(within(lawTabs()).getByRole('button', { name: 'Калькулятор' })).toBeDisabled();
    for (const name of ['Над игрой: закреплённое, заметка', SERVICE, 'Профиль']) expect(within(rail()).getByRole('button', { name })).toBeEnabled();
  });
});
