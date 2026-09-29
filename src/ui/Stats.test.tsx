import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { sendUsage } from '../account/usage';
import { createFakePlatform } from '../platform/fake';
import { renderApp } from '../test/renderApp';

const SKYZE = { id: 'user-1', name: 'Skyze', via: 'discord' as const };
const search = () => screen.getByRole('searchbox', { name: 'Поиск по законам' });
const stats = () => within(screen.getByRole('region', { name: 'Аккаунт' })).getByRole('group', { name: 'Статистика' });

/** A search for УК 65, its article opened, and put into the calculator from it. */
async function useTheHelper(user: Awaited<ReturnType<typeof renderApp>>['user']) {
  await user.type(search(), 'ук 65');
  await user.keyboard('{ArrowRight}');
  await user.keyboard('{Enter}');
}

describe('the player’s counts', () => {
  it('shows in the profile what they did: articles opened, searches, punishments worked out, the articles used most', async () => {
    const { platform, user } = await renderApp({ account: SKYZE });
    await useTheHelper(user);
    await vi.waitFor(() => expect([...platform.settings.keys()].some((key) => key.startsWith('stats:'))).toBe(true));

    await user.keyboard('{Control>}6{/Control}');
    await vi.waitFor(() => expect(stats()).toHaveTextContent('1открыта статья1поиск1расчёт наказания'));
    expect(within(stats()).getByRole('list', { name: 'Чаще всего' })).toHaveTextContent('УК ст. 65 ч. 1');
  });

  it('counts for the author only the day, the server and what was done', async () => {
    const { platform, user } = await renderApp();
    await useTheHelper(user);
    await vi.waitFor(() => expect(Object.keys(platform.settings.get('usage.pending') ?? {})).toHaveLength(3));
    const counted = Object.keys(platform.settings.get('usage.pending') as object).map((key) => key.replace(/^\d{4}-\d\d-\d\d\|/, ''));
    expect(counted.sort()).toEqual(['tverskoi|calculation', 'tverskoi|open', 'tverskoi|search']);
  });

  it('counts nothing for the author once the player turned it off', async () => {
    const off = await renderApp({ settings: { 'usage.share': false } });
    await useTheHelper(off.user);
    await vi.waitFor(() => expect([...off.platform.settings.keys()].some((key) => key.startsWith('stats:'))).toBe(true));
    expect(off.platform.settings.get('usage.pending')).toBeUndefined();
  });
});

describe('the author’s counts, sent', () => {
  const at = (iso: string) => new Date(iso);

  it('sends what gathered at most once an hour, takes off what was sent, drops what is older than a week', async () => {
    const platform = createFakePlatform();
    platform.settings.set('usage.pending', { '2026-09-29|tverskoi|open': 3, '2026-09-28|arbatskiy|search': 1, '2026-09-01|tverskoi|open': 9 });
    const sent: unknown[] = [];
    const send = async (counts: unknown[]) => {
      sent.push(counts);
    };
    await sendUsage(platform, send, at('2026-09-29T12:00:00'));
    expect(sent).toEqual([
      [
        { day: '2026-09-29', server: 'tverskoi', event: 'open', count: 3 },
        { day: '2026-09-28', server: 'arbatskiy', event: 'search', count: 1 },
      ],
    ]);
    expect(platform.settings.get('usage.pending')).toEqual({});

    platform.settings.set('usage.pending', { '2026-09-29|tverskoi|open': 1 });
    await sendUsage(platform, send, at('2026-09-29T12:30:00'));
    expect(sent).toHaveLength(1);
    await sendUsage(platform, send, at('2026-09-29T13:01:00'));
    expect(sent).toHaveLength(2);
  });

  it('keeps them while offline, and sends nothing once turned off', async () => {
    const platform = createFakePlatform();
    platform.settings.set('usage.pending', { '2026-09-29|tverskoi|open': 3 });
    await expect(sendUsage(platform, async () => Promise.reject(new Error('offline')), at('2026-09-29T12:00:00'))).rejects.toThrow('offline');
    expect(platform.settings.get('usage.pending')).toEqual({ '2026-09-29|tverskoi|open': 3 });

    platform.settings.set('usage.share', false);
    const send = vi.fn();
    await sendUsage(platform, send, at('2026-09-29T14:00:00'));
    expect(send).not.toHaveBeenCalled();
    expect(platform.settings.get('usage.pending')).toEqual({});
  });

  it('is turned off in the settings', async () => {
    const { platform, user } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    const share = screen.getByRole('checkbox', { name: 'Отправлять автору обезличенную статистику' });
    expect(share).toBeChecked();
    await user.click(share);
    expect(platform.settings.get('usage.share')).toBe(false);
  });
});
