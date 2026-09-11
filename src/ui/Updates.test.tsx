import { cleanup, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/renderApp';
import { APP_VERSION } from './about';
import { AUTO_KEY, DISMISSED_KEY } from './updates';

const banner = () => screen.queryByRole('status', { name: 'Обновление' });
const settings = () => screen.getByRole('group', { name: 'Настройки' });

describe('updates of the app', () => {
  it('offers nothing when this is the latest version, or when GitHub cannot be reached', async () => {
    await renderApp();
    expect(banner()).not.toBeInTheDocument();
    cleanup();
    const { platform } = await renderApp({ platform: { update: 'offline' } });
    await vi.waitFor(() => expect(platform.calls.some((c) => c.method === 'checkForUpdate')).toBe(true));
    expect(banner()).not.toBeInTheDocument();
  });

  it('offers a new version under the header: what is new, and update now', async () => {
    const { platform, user } = await renderApp({ platform: { update: { version: '1.1.0' } } });
    const offer = await screen.findByRole('status', { name: 'Обновление' });
    expect(offer).toHaveTextContent('Доступна версия 1.1.0');

    await user.click(within(offer).getByRole('button', { name: 'Что нового' }));
    expect(platform.calls.at(-1)).toEqual({ method: 'openExternal', args: ['https://github.com/skyyyzeee/ro-helper/releases/tag/v1.1.0'] });

    await user.click(within(offer).getByRole('button', { name: 'Обновить' }));
    expect(platform.state.updateInstalled).toBe(true);
    expect(banner()).toHaveTextContent('Обновляю до версии 1.1.0');
    expect(banner()).toHaveTextContent('Загрузка… 100% Программа перезапустится сама.');
  });

  it('puts a version off with «Позже» until a newer one comes', async () => {
    const { platform, user } = await renderApp({ platform: { update: { version: '1.1.0' } } });
    await user.click(within(await screen.findByRole('status', { name: 'Обновление' })).getByRole('button', { name: 'Позже' }));
    expect(banner()).not.toBeInTheDocument();
    expect(platform.settings.get(DISMISSED_KEY)).toBe('1.1.0');

    cleanup();
    const again = await renderApp({ platform: { update: { version: '1.1.0' } }, settings: { [DISMISSED_KEY]: '1.1.0' } });
    await vi.waitFor(() => expect(again.platform.calls.some((c) => c.method === 'checkForUpdate')).toBe(true));
    expect(banner()).not.toBeInTheDocument();

    cleanup();
    await renderApp({ platform: { update: { version: '1.2.0' } }, settings: { [DISMISSED_KEY]: '1.1.0' } });
    expect(await screen.findByRole('status', { name: 'Обновление' })).toHaveTextContent('Доступна версия 1.2.0');
  });

  it('checks from the settings and says what it found, a version put off included', async () => {
    const { platform, user } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    await user.click(within(settings()).getByRole('button', { name: 'Проверить обновления' }));
    expect(await within(settings()).findByText('Установлена последняя версия')).toBeInTheDocument();

    platform.state.update = 'offline';
    await user.click(within(settings()).getByRole('button', { name: 'Проверить обновления' }));
    expect(await within(settings()).findByText('Нет связи с GitHub')).toBeInTheDocument();

    platform.state.update = { version: '1.1.0' };
    await platform.writeSetting(DISMISSED_KEY, '1.1.0');
    await user.click(within(settings()).getByRole('button', { name: 'Проверить обновления' }));
    expect(await within(settings()).findByText('Доступна версия 1.1.0')).toBeInTheDocument();
    expect(banner()).toHaveTextContent('Доступна версия 1.1.0');
  });

  it('names the version and the author, with links to GitHub and Discord', async () => {
    const { platform, user } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    expect(settings()).toHaveTextContent(`РО Хелпер ${APP_VERSION} · автор skyze`);
    await user.click(within(settings()).getByRole('button', { name: 'GitHub' }));
    expect(platform.calls.at(-1)?.args).toEqual(['https://github.com/skyyyzeee/ro-helper']);
    await user.click(within(settings()).getByRole('button', { name: 'Discord' }));
    expect(platform.calls.at(-1)?.args).toEqual(['https://discord.gg/VBNn86EmDd']);
  });

  it('does not go online by itself when automatic checks are off, but still checks when asked', async () => {
    const { platform, user } = await renderApp({ platform: { update: { version: '1.1.0' } }, settings: { [AUTO_KEY]: false } });
    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    const auto = within(settings()).getByRole('checkbox', { name: 'Проверять обновления автоматически' });
    expect(auto).not.toBeChecked();
    expect(platform.calls.some((c) => c.method === 'checkForUpdate')).toBe(false);
    expect(banner()).not.toBeInTheDocument();

    await user.click(within(settings()).getByRole('button', { name: 'Проверить обновления' }));
    expect(await within(settings()).findByText('Доступна версия 1.1.0')).toBeInTheDocument();

    await user.click(auto);
    expect(platform.settings.get(AUTO_KEY)).toBe(true);
  });

  it('checks by itself by default, and remembers when that is turned off', async () => {
    const { platform, user } = await renderApp();
    await vi.waitFor(() => expect(platform.calls.some((c) => c.method === 'checkForUpdate')).toBe(true));
    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    const auto = within(settings()).getByRole('checkbox', { name: 'Проверять обновления автоматически' });
    expect(auto).toBeChecked();
    await user.click(auto);
    expect(platform.settings.get(AUTO_KEY)).toBe(false);
  });
});
