import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderApp } from '../test/renderApp';
import { DEFAULT_HOTKEY, OPACITY_KEY } from './overlaySettings';

const search = () => screen.getByRole('searchbox', { name: 'Поиск по законам' });

afterEach(() => document.documentElement.style.removeProperty('--glass-alpha'));

describe('overlay window', () => {
  it('registers the hotkey, which hides the overlay and brings it back with the cursor in the search field', async () => {
    const { platform } = await renderApp();
    await act(async () => {});
    expect(platform.state.hotkey).toBe(DEFAULT_HOTKEY);

    await act(async () => platform.pressHotkey());
    expect(platform.state.overlayVisible).toBe(false);

    search().blur();
    await act(async () => platform.pressHotkey());
    expect(platform.state.overlayVisible).toBe(true);
    expect(search()).toHaveFocus();
  });

  it('steps back one layer per Esc: article → search text → hidden overlay', async () => {
    const { platform, user } = await renderApp();
    await user.type(search(), 'ук 104');
    await user.click(screen.getByRole('button', { name: /ст\. 104\s*Оскорбление/ }));
    expect(screen.getByRole('article', { name: /Статья 104/ })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Результаты поиска' })).toBeInTheDocument();
    expect(platform.state.overlayVisible).toBe(true);

    await user.keyboard('{Escape}');
    expect(search()).toHaveValue('');
    expect(platform.state.overlayVisible).toBe(true);

    await user.keyboard('{Escape}');
    expect(platform.state.overlayVisible).toBe(false);
  });

  it('adjusts the background transparency, saves it and closes the settings on Esc', async () => {
    const { platform, user } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    const settings = screen.getByRole('group', { name: 'Настройки' });
    const slider = within(settings).getByRole('slider', { name: 'Прозрачность фона' });
    expect(slider).toHaveValue('38');

    fireEvent.change(slider, { target: { value: '60' } });
    expect(document.documentElement.style.getPropertyValue('--glass-alpha')).toBe('0.4');
    expect(platform.settings.get(OPACITY_KEY)).toBe(0.4);
    expect(settings).toHaveTextContent('60%');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('group', { name: 'Настройки' })).not.toBeInTheDocument();
    expect(platform.state.overlayVisible).toBe(true);
  });

  it('starts with the saved transparency', async () => {
    await renderApp({ settings: { [OPACITY_KEY]: 0.8 } });
    await act(async () => {});
    expect(document.documentElement.style.getPropertyValue('--glass-alpha')).toBe('0.8');
  });

  it('in the app, offers to reset the window position and resizes the frameless window from its edges', async () => {
    const { platform, user } = await renderApp({ platform: { kind: 'tauri' } });
    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    await user.click(screen.getByRole('button', { name: 'Сбросить положение окна' }));
    expect(platform.calls.some((call) => call.method === 'resetWindowBounds')).toBe(true);

    const west = document.querySelector('.resize--w')!;
    fireEvent.pointerDown(west, { button: 0 });
    expect(platform.calls.at(-1)).toEqual({ method: 'startResize', args: ['West'] });
  });

  it('in the browser preview, has no window to reset or resize', async () => {
    const { user } = await renderApp({ platform: { kind: 'browser' } });
    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    expect(screen.queryByRole('button', { name: 'Сбросить положение окна' })).not.toBeInTheDocument();
    expect(document.querySelector('.resize')).toBeNull();
  });
});
