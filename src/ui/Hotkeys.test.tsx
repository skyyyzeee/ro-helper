import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/renderApp';

const keys = () => within(screen.getByRole('group', { name: 'Настройки' }));

describe('a key another program holds (issue #40)', () => {
  it('is told over the game and beside the key in the settings — the others stay quiet', async () => {
    const { platform, user } = await renderApp({ platform: { takenHotkeys: ['Alt+S'] } });
    await vi.waitFor(() =>
      expect(platform.state.toast).toMatchObject({ title: 'Клавиша Alt + S занята другой программой', text: expect.stringMatching(/^Быстрый поиск по ней не откроется\./) }),
    );
    expect(platform.state.quickHotkey).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    const quick = keys().getByRole('region', { name: 'Быстрый поиск' });
    expect(within(quick).getByRole('alert')).toHaveTextContent('Сочетание занято другой программой');
    expect(within(keys().getByRole('region', { name: 'Горячая клавиша' })).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says nothing while every key is the assistant’s', async () => {
    const { platform, user } = await renderApp();
    await vi.waitFor(() => expect(platform.state.quickHotkey).toBe('Alt+S'));
    expect(platform.state.toast).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    expect(within(keys().getByRole('region', { name: 'Быстрый поиск' })).queryByRole('alert')).not.toBeInTheDocument();
  });
});
