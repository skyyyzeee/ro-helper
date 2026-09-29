import { describe, expect, it, vi } from 'vitest';
import { createSync, type RemoteSetting, type SyncBackend } from '../account/sync';
import { createFakePlatform } from '../platform/fake';
import { SYNC_RULES } from './syncedSettings';

/** The account's settings in memory, as the table keeps them: an older change never overwrites a newer one. */
function account(rows: RemoteSetting[] = []) {
  const table = new Map(rows.map((row) => [row.key, row]));
  let offline = false;
  const backend: SyncBackend = {
    async pull(since) {
      if (offline) throw new Error('offline');
      return [...table.values()].filter((row) => !since || row.updated_at > since);
    },
    async push(settings) {
      if (offline) throw new Error('offline');
      for (const row of settings) if (!table.has(row.key) || table.get(row.key)!.updated_at <= row.updated_at) table.set(row.key, row);
    },
  };
  return {
    backend,
    table,
    setOffline: (on: boolean) => {
      offline = on;
    },
  };
}

/** A computer: its settings, and the sync of them with a clock that moves a second a call. */
function computer(settings: Record<string, unknown>, backend: SyncBackend) {
  const platform = createFakePlatform();
  for (const [key, value] of Object.entries(settings)) platform.settings.set(key, value);
  let t = Date.parse('2026-09-29T12:00:00Z');
  const onRemote = vi.fn();
  const sync = createSync(platform, backend, SYNC_RULES, { onRemote, pushDelayMs: 0, now: () => new Date((t += 1000)) });
  /** A setting changed here, as the app saves it. */
  const change = async (key: string, value: unknown) => {
    await platform.writeSetting(key, value);
    await sync.record(key, value);
    await sync.sync();
  };
  return { platform, sync, onRemote, change, get: (key: string) => platform.settings.get(key) };
}

const HOME = {
  profile: { server: 'tverskoi', organization: 'mvd', hotkey: 'Alt+Q' },
  'appearance.theme': 'dense',
  'favorites:tverskoi': ['uk-65#1', 'koap-8.6#1'],
  'recent:tverskoi': ['uk-104#'],
  'window.bounds': { x: 1, y: 2, width: 900, height: 620 },
  'laws.seen:tverskoi': '2026-09-27',
};

describe('the settings, synced with the account', () => {
  it('takes this computer’s settings into the account at the first sign-in — not the hotkey, the window or what it has seen', async () => {
    const cloud = account();
    const home = computer(HOME, cloud.backend);
    await home.sync.start('user-1');

    expect(Object.fromEntries([...cloud.table].map(([key, row]) => [key, row.value]))).toEqual({
      profile: { server: 'tverskoi', organization: 'mvd' },
      'appearance.theme': 'dense',
      'favorites:tverskoi': ['uk-65#1', 'koap-8.6#1'],
      'recent:tverskoi': ['uk-104#'],
    });
    expect(home.sync.status()).toMatchObject({ kind: 'synced' });
    expect(home.onRemote).not.toHaveBeenCalled();
  });

  it('on a second computer: the account’s server and look, the favourites of both, its own hotkey', async () => {
    const cloud = account();
    await computer(HOME, cloud.backend).sync.start('user-1');

    const work = computer(
      { profile: { server: 'arbatskiy', organization: 'fsb', hotkey: 'F9' }, 'appearance.theme': 'minimal', 'favorites:tverskoi': ['uk-104#', 'uk-65#1'] },
      cloud.backend,
    );
    await work.sync.start('user-1');

    expect(work.get('profile')).toEqual({ server: 'tverskoi', organization: 'mvd', hotkey: 'F9' });
    expect(work.get('appearance.theme')).toBe('dense');
    expect(work.get('favorites:tverskoi')).toEqual(['uk-65#1', 'koap-8.6#1', 'uk-104#']);
    expect(work.get('recent:tverskoi')).toEqual(['uk-104#']);
    expect(cloud.table.get('favorites:tverskoi')?.value).toEqual(['uk-65#1', 'koap-8.6#1', 'uk-104#']);
    // The UI reads the settings again.
    expect(work.onRemote).toHaveBeenCalled();
  });

  it('sends a change a moment after it is made, and the other computer takes it on its next sync', async () => {
    const cloud = account();
    const home = computer(HOME, cloud.backend);
    const work = computer({}, cloud.backend);
    await home.sync.start('user-1');
    await work.sync.start('user-1');

    await home.change('profile', { server: 'kutuzovskiy', organization: 'none', hotkey: 'Alt+Q' });
    expect(cloud.table.get('profile')?.value).toEqual({ server: 'kutuzovskiy', organization: 'none' });

    work.onRemote.mockClear();
    await work.sync.sync();
    expect(work.get('profile')).toEqual({ server: 'kutuzovskiy', organization: 'none', hotkey: 'Alt+Q' });
    expect(work.onRemote).toHaveBeenCalledTimes(1);
    // Nothing new: nothing to read again.
    await work.sync.sync();
    expect(work.onRemote).toHaveBeenCalledTimes(1);
  });

  it('keeps a change made offline and sends it once the connection is back — even after a restart', async () => {
    const cloud = account();
    const home = computer(HOME, cloud.backend);
    await home.sync.start('user-1');

    cloud.setOffline(true);
    await home.platform.writeSetting('appearance.theme', 'minimal');
    await home.sync.record('appearance.theme', 'minimal');
    await home.sync.sync();
    expect(home.sync.status()).toMatchObject({ kind: 'offline' });
    expect(home.get('sync.pending')).toHaveProperty('appearance.theme');
    expect(cloud.table.get('appearance.theme')?.value).toBe('dense');

    // The app starts again, online.
    cloud.setOffline(false);
    const again = createSync(home.platform, cloud.backend, SYNC_RULES, { onRemote: () => {}, pushDelayMs: 0 });
    await again.start('user-1');
    expect(cloud.table.get('appearance.theme')?.value).toBe('minimal');
    expect(home.get('sync.pending')).toEqual({});
  });

  it('lets the later change win: an older one from another computer does not undo a newer one here', async () => {
    const cloud = account();
    const home = computer(HOME, cloud.backend);
    await home.sync.start('user-1');
    cloud.table.set('appearance.theme', { key: 'appearance.theme', value: 'glass', updated_at: '2026-09-29T11:00:00.000Z' });
    await home.change('appearance.theme', 'minimal');
    await home.sync.sync();
    expect(home.get('appearance.theme')).toBe('minimal');
    expect(cloud.table.get('appearance.theme')?.value).toBe('minimal');
  });

  it('does nothing while signed out', async () => {
    const cloud = account();
    const home = computer(HOME, cloud.backend);
    await home.sync.record('appearance.theme', 'minimal');
    await home.sync.sync();
    expect(cloud.table.size).toBe(0);
    expect(home.get('sync.pending')).toBeUndefined();
  });
});

describe('joining the sets of pinned cards', () => {
  it('keeps both computers’ sets, one of a name, with ids of their own', () => {
    const card = { id: 'uk-65#1', kind: 'article' as const, heading: 'УК ст. 65 ч. 1', lines: [] };
    const set = (id: string, name: string) => ({ id, name, groups: [{ id: 'g', x: 0, y: 0, cards: [card] }] });
    const joined = SYNC_RULES.merge('pin-presets:tverskoi', [set('p1', 'Патруль'), set('p2', 'Обыск')], [set('p1', 'Задержание'), set('p2', 'обыск')]);
    expect((joined as { id: string; name: string }[]).map((preset) => `${preset.id} ${preset.name}`)).toEqual(['p1 Патруль', 'p2 Обыск', 'p3 Задержание']);
  });
});
