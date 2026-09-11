import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/renderApp';

const root = join(import.meta.dirname, '..', '..');

describe('the privacy policy', () => {
  it('opens from the settings, from the same file as on GitHub, and Esc closes it', async () => {
    const { platform, user } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    await user.click(within(screen.getByRole('group', { name: 'Настройки' })).getByRole('button', { name: 'Политика конфиденциальности' }));

    const policy = screen.getByRole('article', { name: 'Политика конфиденциальности' });
    expect(within(policy).getByRole('heading', { level: 2 })).toHaveTextContent('Политика конфиденциальности');
    expect(policy).toHaveTextContent('РО Хелпер не собирает и не отправляет данные о вас');
    // Only the Russian part: the English one is for GitHub.
    expect(policy).not.toHaveTextContent('English');

    await user.click(within(policy).getByRole('button', { name: 'Discord' }));
    expect(platform.calls.at(-1)).toEqual({ method: 'openExternal', args: ['https://discord.gg/VBNn86EmDd'] });

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('article', { name: 'Политика конфиденциальности' })).not.toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Поиск по законам' })).toHaveFocus();
  });

  it('names the only address the app goes online to, the one the updater really uses', () => {
    const policy = readFileSync(join(root, 'PRIVACY.md'), 'utf8');
    const config = JSON.parse(readFileSync(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
    const [endpoint] = config.plugins.updater.endpoints;
    expect(policy).toContain(endpoint);
    // Every link the policy opens is one the app may open.
    const capabilities = readFileSync(join(root, 'src-tauri', 'capabilities', 'default.json'), 'utf8');
    for (const [, url] of policy.split('\n---\n')[0].matchAll(/\]\((https:\/\/[^/)]+)/g)) expect(capabilities).toContain(url);
  });
});
