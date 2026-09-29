import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/renderApp';

const rail = () => screen.getByRole('navigation', { name: 'Разделы' });

describe('the side column', () => {
  it('is always on screen: the server on top, the sections, the settings and the profile at the foot', async () => {
    await renderApp();
    const buttons = within(rail()).getAllByRole('button');
    expect(buttons[0]).toHaveAccessibleName('Сменить сервер или организацию');
    expect(buttons.slice(1).map((b) => b.getAttribute('aria-label'))).toEqual(['Поиск', 'Все документы', 'Калькулятор', 'Закреплённое', 'ИИ-разбор ситуации', 'История ИИ-разборов', 'Памятки', 'Настройки', 'Профиль']);
    expect(within(rail()).getByRole('button', { name: 'Поиск' })).toHaveAttribute('aria-current', 'page');
  });

  it('opens and closes the documents and the settings, and marks the one open', async () => {
    const { user } = await renderApp();
    const documents = within(rail()).getByRole('button', { name: 'Все документы' });
    await user.click(documents);
    expect(documents).toHaveAttribute('aria-expanded', 'true');
    expect(documents).toHaveAttribute('aria-current', 'page');
    await user.click(within(rail()).getByRole('button', { name: 'Настройки' }));
    expect(screen.getByRole('group', { name: 'Настройки' })).toBeInTheDocument();
    expect(documents).toHaveAttribute('aria-expanded', 'false');
    await user.click(within(rail()).getByRole('button', { name: 'Настройки' }));
    expect(screen.queryByRole('group', { name: 'Настройки' })).not.toBeInTheDocument();
  });

  it('opens its sections with Ctrl and a number', async () => {
    const { user } = await renderApp();
    await user.keyboard('{Control>}2{/Control}');
    expect(within(rail()).getByRole('button', { name: 'Все документы' })).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Control>}5{/Control}');
    expect(screen.getByRole('group', { name: 'Настройки' })).toBeInTheDocument();
  });

  it('opens the choice of server and organisation from the server’s mark', async () => {
    const { user } = await renderApp();
    await user.click(within(rail()).getByRole('button', { name: 'Сменить сервер или организацию' }));
    expect(screen.getByRole('region', { name: 'Сервер и организация' })).toBeInTheDocument();
  });

  it('shows the memos as coming, and the calculator only once it has charges', async () => {
    await renderApp();
    for (const name of ['Памятки', 'Калькулятор']) expect(within(rail()).getByRole('button', { name })).toBeDisabled();
    for (const name of ['Закреплённое', 'Профиль']) expect(within(rail()).getByRole('button', { name })).toBeEnabled();
  });
});
