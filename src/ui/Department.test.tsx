import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/renderApp';

const DEPARTMENT = 'Отдел: порядок действий по закону';

describe('the department', () => {
  it('shows a force its topics of the law: a topic lists the articles, an article opens and Esc steps back', async () => {
    const app = await renderApp({ profile: { organization: 'mvd' } });
    await app.user.click(screen.getByRole('button', { name: DEPARTMENT }));
    const topics = screen.getByRole('region', { name: 'Как это делается по закону' });
    await app.user.click(within(topics).getByRole('button', { name: /^Задержание/ }));
    const list = screen.getByRole('list', { name: 'Задержание' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.length).toBeGreaterThan(3);
    expect(within(list).getAllByText('УПК').length).toBeGreaterThan(0);
    await app.user.click(within(rows[0]).getAllByRole('button')[0]);
    expect(screen.getByRole('button', { name: 'Отдел' })).toBeInTheDocument();
    await app.user.keyboard('{Escape}');
    expect(screen.getByRole('list', { name: 'Задержание' })).toBeInTheDocument();
    await app.user.keyboard('{Escape}');
    expect(screen.getByRole('region', { name: 'Как это делается по закону' })).toBeInTheDocument();
  });

  it('shows the charter in short, each card with the points it rests on', async () => {
    const app = await renderApp({ profile: { organization: 'mvd' } });
    await app.user.click(screen.getByRole('button', { name: DEPARTMENT }));
    const ranks = screen.getByRole('article', { name: 'Звания снизу вверх' });
    expect(within(ranks).getByText('Генерал-полковник')).toBeInTheDocument();
    await app.user.click(within(ranks).getByRole('button', { name: 'п. 15.1' }));
    expect(screen.getByRole('heading', { name: /15\.1/ })).toBeInTheDocument();
  });

  it('gives a hospital its charter but no topics of detention', async () => {
    const app = await renderApp({ profile: { organization: 'hospital' } });
    await app.user.click(screen.getByRole('button', { name: DEPARTMENT }));
    expect(screen.queryByRole('region', { name: 'Как это делается по закону' })).toBeNull();
    expect(screen.getByRole('article', { name: 'Рабочее время' })).toBeInTheDocument();
  });

  it('asks a player without an organisation to choose one', async () => {
    const app = await renderApp({ profile: { organization: 'none' } });
    await app.user.click(screen.getByRole('button', { name: DEPARTMENT }));
    expect(screen.getByText(/Выберите организацию/)).toBeInTheDocument();
  });
});
