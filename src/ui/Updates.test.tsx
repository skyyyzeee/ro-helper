import { act, cleanup, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/renderApp';
import { APP_VERSION } from './about';
import { AUTO_KEY, DISMISSED_KEY, TOASTED_KEY } from './updates';

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

    await user.click(within(offer).getByRole('button', { name: 'Обновить' }));
    expect(platform.state.updateInstalled).toBe(true);
    expect(banner()).toHaveTextContent('Обновляю до версии 1.1.0');
    expect(banner()).toHaveTextContent('Загрузка… 100% Программа перезапустится сама.');
  });

  it('shows what is new in the version on offer inside the overlay, and updates from there', async () => {
    const notes = [
      '## Что нового',
      '',
      '- Закреплённая статья больше не закрывает хелпер.',
      '- Регламент ФСО: подпункты списком.',
      '',
      '## Установка',
      '',
      'Скачайте установщик ниже.',
    ].join('\n');
    const { platform, user } = await renderApp({ platform: { update: { version: '1.1.0', date: '2026-09-20T10:00:00Z', notes } } });
    await user.click(within(await screen.findByRole('status', { name: 'Обновление' })).getByRole('button', { name: 'Что нового' }));

    const page = screen.getByRole('article', { name: 'Что нового в версии 1.1.0' });
    expect(page).toHaveTextContent('Вышла 20.09.2026');
    expect(within(page).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Закреплённая статья больше не закрывает хелпер.',
      'Регламент ФСО: подпункты списком.',
    ]);
    // How to install is for the release page, not for an app that updates itself.
    expect(page).not.toHaveTextContent('Скачайте установщик');
    expect(platform.calls.some((c) => c.method === 'openExternal')).toBe(false);

    await user.click(within(page).getByRole('button', { name: 'Страница релиза на GitHub' }));
    expect(platform.calls.at(-1)).toEqual({ method: 'openExternal', args: ['https://github.com/skyyyzeee/ro-helper/releases/tag/v1.1.0'] });

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('article', { name: /^Что нового/ })).not.toBeInTheDocument();

    await user.click(within(screen.getByRole('status', { name: 'Обновление' })).getByRole('button', { name: 'Что нового' }));
    await user.click(screen.getByRole('button', { name: 'Обновить до 1.1.0' }));
    expect(platform.state.updateInstalled).toBe(true);
    expect(screen.queryByRole('article', { name: /^Что нового/ })).not.toBeInTheDocument();
  });

  it('says where to read about a release that came without notes', async () => {
    const { user } = await renderApp({ platform: { update: { version: '1.1.0', notes: ['## Что нового', '', '- …', '', '## Установка', '', 'Скачайте.'].join('\n') } } });
    await user.click(within(await screen.findByRole('status', { name: 'Обновление' })).getByRole('button', { name: 'Что нового' }));
    expect(screen.getByRole('article', { name: 'Что нового в версии 1.1.0' })).toHaveTextContent('Список изменений есть на странице релиза.');
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

  it('tells a new version once over the game, top right, so it is seen with the overlay hidden', async () => {
    const { platform } = await renderApp({ platform: { update: { version: '1.1.0' } } });
    await vi.waitFor(() => expect(platform.state.toast).not.toBeNull());
    expect(platform.state.toast).toMatchObject({
      title: 'Вышло обновление РО Хелпер',
      text: 'Версия 1.1.0. Откройте хелпер (Alt + Q) и нажмите «Обновить».',
    });
    expect(platform.settings.get(TOASTED_KEY)).toBe('1.1.0');

    // Launched again with the same version on offer: told already.
    cleanup();
    const again = await renderApp({ platform: { update: { version: '1.1.0' } }, settings: { [TOASTED_KEY]: '1.1.0' } });
    await told(again.platform);
    expect(again.platform.calls.some((c) => c.method === 'showToast')).toBe(false);

    // A newer one is told in its turn.
    cleanup();
    const newer = await renderApp({ platform: { update: { version: '1.2.0' } }, settings: { [TOASTED_KEY]: '1.1.0' } });
    await vi.waitFor(() => expect(newer.platform.state.toast?.text).toContain('1.2.0'));
  });

  it('does not tell a version put off with «Позже»', async () => {
    const { platform } = await renderApp({ platform: { update: { version: '1.1.0' } }, settings: { [DISMISSED_KEY]: '1.1.0' } });
    await told(platform);
    expect(platform.calls.some((c) => c.method === 'showToast')).toBe(false);
  });
});

/** Waits until the overlay has looked up whether the version on offer was told already, and acted on it. */
async function told(platform: Awaited<ReturnType<typeof renderApp>>['platform']) {
  await vi.waitFor(() => expect(platform.calls.some((c) => c.method === 'readSetting' && c.args[0] === TOASTED_KEY)).toBe(true));
  await act(async () => {});
}
