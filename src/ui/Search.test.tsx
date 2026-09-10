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

const results = () => within(screen.getByRole('list', { name: 'Результаты поиска' })).getAllByRole('listitem');
const search = () => screen.getByRole('searchbox', { name: 'Поиск по законам' });

describe('finding an article by number', () => {
  it('shows each punished part of an УК article with its jurisdiction, stars and punishment', async () => {
    const { user } = renderApp();
    await user.type(search(), 'ук 65');

    const [first, second] = results();
    expect(first).toHaveTextContent('УК');
    expect(first).toHaveTextContent('ст. 65 ч. 1');
    expect(first).toHaveTextContent('Кража');
    expect(first).toHaveTextContent('Р/Ф');
    expect(within(first).getByRole('img', { name: 'Звёзд розыска: 3' })).toBeInTheDocument();
    expect(first).toHaveTextContent('штраф до 50 000 ₽ либо 30 мес');

    expect(second).toHaveTextContent('ст. 65 ч. 2');
    expect(second).toHaveTextContent('Кража, совершенная');
    expect(within(second).getByRole('img', { name: 'Звёзд розыска: 4' })).toBeInTheDocument();
    expect(second).toHaveTextContent('штраф до 90 000 ₽ либо 40 мес');
  });

  it('opens the article on the part that was clicked and goes back to the results', async () => {
    const { user, platform } = renderApp();
    await user.type(search(), '65');
    await user.click(screen.getByRole('button', { name: /ст\. 65 ч\. 2/ }));

    const view = screen.getByRole('article', { name: 'Статья 65. Кража' });
    expect(within(view).getByRole('heading', { name: 'Статья 65. Кража' })).toBeInTheDocument();
    expect(view).toHaveTextContent('Глава 14. Преступления против собственности');
    expect(within(view).getByRole('region', { name: 'Часть 2' })).toHaveAttribute('aria-current', 'true');
    expect(within(view).getByRole('region', { name: 'Часть 1' })).not.toHaveAttribute('aria-current');
    expect(view).toHaveTextContent('Примечание');
    expect(view).toHaveTextContent('Актуально на 06.09.2026');

    await user.click(within(view).getByRole('button', { name: /Тема на форуме/ }));
    expect(platform.calls.at(-1)).toEqual({ method: 'openExternal', args: ['https://forum.russia.online/threads/ugolovnyi-kodeks.1176/'] });

    await user.click(within(view).getByRole('button', { name: 'Результаты' }));
    expect(results()).toHaveLength(2);
  });

  it('finds one КоАП part with «ч N» and lists sanctions by who they apply to', async () => {
    const { user } = renderApp();
    await user.type(search(), 'коап 5.4 ч 1');

    const [only] = results();
    expect(results()).toHaveLength(1);
    expect(only).toHaveTextContent('КоАП');
    expect(only).toHaveTextContent('ст. 5.4 ч. 1');
    expect(only).toHaveTextContent('штраф от 10 000 до 25 000 ₽ либо арест до 20 сут');

    await user.click(within(only).getByRole('button'));
    const part = screen.getByRole('region', { name: 'Часть 1' });
    expect(part).toHaveTextContent('Гражданам: штраф от 10 000 до 25 000 ₽ либо арест до 20 сут');
    expect(part).toHaveTextContent('Должностным лицам: штраф от 30 000 до 50 000 ₽ либо арест до 20 сут');
    expect(part).toHaveTextContent('Юридическим лицам: штраф от 25 000 до 100 000 ₽');
  });

  it('shows a ПДД point, which has no title, by the start of its text', async () => {
    const { user } = renderApp();
    await user.type(search(), 'пдд 8.2');

    const [only] = results();
    expect(only).toHaveTextContent('ПДД');
    expect(only).toHaveTextContent('ст. 8.2');
    expect(only).toHaveTextContent('В населенных пунктах разрешается движение');

    await user.click(within(only).getByRole('button'));
    const view = screen.getByRole('article', { name: 'Статья 8.2' });
    expect(view).toHaveTextContent('Глава VIII. Скорость движения');
    expect(view).toHaveTextContent('не более 60 км/ч');
  });

  it('finds an article by a word in any form', async () => {
    const { user } = renderApp();
    await user.type(search(), 'кражу');
    expect(results()[0]).toHaveTextContent('ст. 65 ч. 1');
    expect(results()[0]).toHaveTextContent('Кража');
  });

  it('moves the selection with ↑↓ and starts again from the top on a new query', async () => {
    const { user } = renderApp();
    await user.type(search(), 'коап 8.6');
    const current = () => results().findIndex((item) => within(item).getByRole('button').getAttribute('aria-current') === 'true');
    expect(current()).toBe(0);

    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(current()).toBe(2); // stops at the last result
    await user.keyboard('{ArrowUp}');
    expect(current()).toBe(1);

    await user.type(search(), ' ч 1');
    expect(current()).toBe(0);
  });

  it('says so when nothing matches', async () => {
    const { user } = renderApp();
    await user.type(search(), '999');
    expect(screen.getByText('Ничего не найдено')).toBeInTheDocument();
  });
});
