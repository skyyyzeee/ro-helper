import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createFakePlatform } from '../platform/fake';
import { PlatformProvider } from '../platform/PlatformContext';
import { App } from './App';

function renderApp() {
  const platform = createFakePlatform();
  render(
    <PlatformProvider platform={platform}>
      <App />
    </PlatformProvider>,
  );
  return { platform, user: userEvent.setup() };
}

describe('finding an УК article by number', () => {
  it('shows the article with jurisdiction, stars and punishment right in the result', async () => {
    const { user } = renderApp();
    await user.type(screen.getByRole('searchbox', { name: 'Поиск по законам' }), 'ук 65');

    const [first] = within(screen.getByRole('list', { name: 'Результаты поиска' })).getAllByRole('listitem');
    expect(first).toHaveTextContent('УК');
    expect(first).toHaveTextContent('ст. 65');
    expect(first).toHaveTextContent('Кража');
    expect(first).toHaveTextContent('Р/Ф');
    expect(within(first).getByRole('img', { name: 'Звёзд розыска: 3' })).toBeInTheDocument();
    expect(first).toHaveTextContent('штраф до 50 000 ₽ либо 30 мес');
    expect(first).toHaveTextContent('+ ещё 1 ч.');
  });

  it('opens the article text on click and goes back to the results', async () => {
    const { user, platform } = renderApp();
    await user.type(screen.getByRole('searchbox', { name: 'Поиск по законам' }), '65');
    await user.click(screen.getByRole('button', { name: /ст\. 65\s*Кража/ }));

    const view = screen.getByRole('article', { name: 'Статья 65. Кража' });
    expect(within(view).getByRole('heading', { name: 'Статья 65. Кража' })).toBeInTheDocument();
    expect(view).toHaveTextContent('Глава 14. Преступления против собственности');
    expect(view).toHaveTextContent('Кража, то есть тайное хищение чужого имущества');
    expect(view).toHaveTextContent('штраф до 90 000 ₽ либо 40 мес');
    expect(view).toHaveTextContent('Примечание');
    expect(view).toHaveTextContent('Актуально на 06.09.2026');

    await user.click(within(view).getByRole('button', { name: /Тема на форуме/ }));
    expect(platform.calls.at(-1)).toEqual({ method: 'openExternal', args: ['https://forum.russia.online/threads/ugolovnyi-kodeks.1176/'] });

    await user.click(within(view).getByRole('button', { name: 'Результаты' }));
    expect(screen.getByRole('list', { name: 'Результаты поиска' })).toBeInTheDocument();
  });

  it('says so when nothing matches', async () => {
    const { user } = renderApp();
    await user.type(screen.getByRole('searchbox', { name: 'Поиск по законам' }), '999');
    expect(screen.getByText('Ничего не найдено')).toBeInTheDocument();
  });
});
