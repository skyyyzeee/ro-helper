import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/renderApp';
import { APP_VERSION } from './about';
import { CHANGELOG, SEEN_VERSION_KEY, changelogSections, compareVersions, notesSince } from './whatsNew';

const article = (name: string | RegExp) => screen.queryByRole('article', { name });
const versions = () => within(screen.getByRole('article')).getAllByRole('region').map((r) => r.getAttribute('aria-label'));

describe('the changelog', () => {
  it('compares versions number by number', () => {
    expect(compareVersions('1.0.9', '1.0.16')).toBe(-1);
    expect(compareVersions('1.1.0', '1.0.16')).toBe(1);
    expect(compareVersions('1.0.16', '1.0.16')).toBe(0);
  });

  it('is read by its «## 1.2.3» sections, and this version has one', () => {
    const text = ['# Что нового', '', '## 1.0.3', '', '- Третья.', '', '## 1.0.2', '', '- Вторая.', '- Ещё.', '', '## 1.0.1', '', '- Первая.'].join('\n');
    expect(changelogSections(text)).toEqual([
      { version: '1.0.3', notes: '- Третья.' },
      { version: '1.0.2', notes: '- Вторая.\n- Ещё.' },
      { version: '1.0.1', notes: '- Первая.' },
    ]);
    expect(notesSince('1.0.1', '1.0.3', changelogSections(text)).map((s) => s.version)).toEqual(['1.0.3', '1.0.2']);
    expect(notesSince(undefined, '1.0.3', changelogSections(text)).map((s) => s.version)).toEqual(['1.0.3']);
    expect(CHANGELOG[0].version).toBe(APP_VERSION);
  });
});

describe('«Что нового» after an update', () => {
  it('shows every version since the one last run, newest first, once', async () => {
    const seen = CHANGELOG[2].version;
    const { platform, user } = await renderApp({ settings: { [SEEN_VERSION_KEY]: seen } });
    expect(await screen.findByRole('article', { name: `Хелпер обновлён до версии ${APP_VERSION}` })).toBeInTheDocument();
    expect(versions()).toEqual([`Версия ${CHANGELOG[0].version}`, `Версия ${CHANGELOG[1].version}`]);
    await vi.waitFor(() => expect(platform.settings.get(SEEN_VERSION_KEY)).toBe(APP_VERSION));

    await user.keyboard('{Escape}');
    expect(article(/^Хелпер обновлён/)).not.toBeInTheDocument();
    expect(search()).toHaveFocus();
  });

  it('shows only this version to a copy updated from before the app remembered the version', async () => {
    await renderApp({ settings: { [SEEN_VERSION_KEY]: undefined } });
    await screen.findByRole('article', { name: `Хелпер обновлён до версии ${APP_VERSION}` });
    expect(versions()).toEqual([`Версия ${APP_VERSION}`]);
  });

  it('tells nothing to someone who has just installed the app', async () => {
    const { platform, user } = await renderApp({ profile: null });
    await user.click(screen.getByRole('button', { name: 'Далее' }));
    await user.click(screen.getByRole('button', { name: 'Далее' }));
    await user.click(screen.getByRole('button', { name: 'Понятно' }));
    await user.click(screen.getByRole('button', { name: 'Готово' }));
    await screen.findByRole('searchbox', { name: 'Поиск по законам' });
    await vi.waitFor(() => expect(platform.settings.get(SEEN_VERSION_KEY)).toBe(APP_VERSION));
    expect(article(/^Хелпер обновлён/)).not.toBeInTheDocument();
  });

  it('keeps the whole history in the settings', async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    await user.click(screen.getByRole('button', { name: 'История версий' }));
    expect(screen.getByRole('article', { name: 'История версий' })).toBeInTheDocument();
    expect(versions()).toHaveLength(CHANGELOG.length);
    await user.keyboard('{Escape}');
    expect(screen.getByRole('group', { name: 'Настройки' })).toBeInTheDocument();
  });
});

const search = () => screen.getByRole('searchbox', { name: 'Поиск по законам' });
