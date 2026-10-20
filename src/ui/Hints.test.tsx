import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/renderApp';

const search = () => screen.getByRole('searchbox', { name: 'Поиск по законам' });
const hints = () => screen.queryByText('выбор');

describe('the key hints (skyze: less noise)', () => {
  it('show everywhere for the first starts', async () => {
    const { user } = await renderApp();
    await user.type(search(), 'ук 65');
    expect(await screen.findByText('выбор')).toBeInTheDocument();
  });

  it('after them, only on the empty search — not over results or an article', async () => {
    const { user, platform } = await renderApp({ settings: { 'hints.launches': 9 } });
    expect(await screen.findByText('выбор')).toBeInTheDocument();
    await user.type(search(), 'ук 65');
    expect(hints()).not.toBeInTheDocument();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('article')).toBeInTheDocument();
    expect(hints()).not.toBeInTheDocument();
    expect(platform.settings.get('hints.launches')).toBe(10);
  });
});
