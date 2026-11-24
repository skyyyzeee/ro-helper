import { act, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderApp } from '../test/renderApp';

const originalWidth = window.innerWidth;
function resize(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  window.dispatchEvent(new Event('resize'));
}
afterEach(() => resize(originalWidth));

describe('desktop search workspace', () => {
  it('keeps the results while reading and calculating, without extending the window', async () => {
    resize(1180);
    const { user, platform } = await renderApp();
    await user.type(screen.getByRole('searchbox'), 'ук 87');
    const results = screen.getByRole('list', { name: 'Результаты поиска' });
    const second = within(results).getByRole('button', { name: /ст\. 87 ч\. 2\s*Кража/ });
    await user.click(second);
    expect(second).toHaveAttribute('aria-current', 'true');
    const reader = screen.getByRole('region', { name: 'Текст выбранной статьи' });
    expect(within(reader).getByRole('article')).toHaveAccessibleName(/Статья 87/);
    expect(within(reader).queryByRole('button', { name: 'Результаты' })).not.toBeInTheDocument();
    await user.click(within(results).getByRole('button', { name: 'Добавить ст. 87 ч. 1 в калькулятор' }));
    expect(screen.getByRole('complementary', { name: 'Калькулятор' })).toHaveTextContent('30 мес');
    expect(results).toBeInTheDocument();
    expect(reader).toBeInTheDocument();
    expect(platform.calls.some((call) => call.method === 'extendWindow')).toBe(false);
    await user.click(within(reader).getByRole('region', { name: 'Часть 2' }));
    await user.keyboard('{Enter}');
    expect(screen.getByRole('list', { name: 'Статьи в калькуляторе' })).toHaveTextContent('ст. 87 ч. 2');
  });

  it('opens an article on its own when the resized window cannot fit the reader', async () => {
    resize(1180);
    const { user } = await renderApp();
    await user.type(screen.getByRole('searchbox'), 'ук 87');
    expect(screen.getByRole('region', { name: 'Текст выбранной статьи' })).toBeInTheDocument();
    await act(() => resize(900));
    expect(screen.queryByRole('region', { name: 'Текст выбранной статьи' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /ст\. 87 ч\. 1\s*Кража/ }));
    expect(screen.getByRole('article')).toHaveAccessibleName(/Статья 87/);
    await user.click(screen.getByRole('button', { name: 'Результаты' }));
    expect(screen.getByRole('list', { name: 'Результаты поиска' })).toBeInTheDocument();
  });
});

