import { act, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PACK_FORMAT, type ServerPack } from '../core';
import { TVERSKOI_PACK } from '../data';
import { renderApp } from '../test/renderApp';
import { MANIFEST_URL, isNewer, packUrl, readPack } from './laws';

const search = () => screen.getByRole('searchbox', { name: 'Поиск по законам' });

/** The Тверской pack as a later import would write it: built later, with a word in УК ст. 65 no law has. */
function newerPack(changes: { built?: string; version?: string } = {}): ServerPack {
  const pack = structuredClone(TVERSKOI_PACK);
  pack.built = changes.built ?? '2030-01-01T00:00:00.000Z';
  if (changes.version) pack.version = changes.version;
  const theft = pack.documents.find((d) => d.id === 'uk')!.articles.find((a) => a.id === 'uk-65')!;
  theft.parts[0].text = `${theft.parts[0].text} Зеленоглазый`;
  return pack;
}

const remote = (pack: ServerPack, format = PACK_FORMAT) => ({
  [MANIFEST_URL]: JSON.stringify({ format, packs: { tverskoi: { built: pack.built, version: pack.version } } }),
  [packUrl('tverskoi')]: JSON.stringify(pack),
});

/** Waits until the start's check for newer laws has run its course. */
const checked = async (platform: Awaited<ReturnType<typeof renderApp>>['platform']) => {
  await vi.waitFor(() => expect(platform.calls.some((c) => c.method === 'download')).toBe(true));
  await act(async () => {});
};

describe('a pack read from a file', () => {
  it('is taken only whole, for its server and in the shape this app reads', () => {
    const pack = newerPack();
    expect(readPack(JSON.stringify(pack), 'tverskoi')?.built).toBe(pack.built);
    expect(readPack(JSON.stringify(pack), 'arbatskiy')).toBeUndefined();
    expect(readPack(JSON.stringify({ ...pack, format: PACK_FORMAT + 1 }), 'tverskoi')).toBeUndefined();
    expect(readPack(JSON.stringify({ ...pack, documents: [] }), 'tverskoi')).toBeUndefined();
    expect(readPack('{"server":', 'tverskoi')).toBeUndefined();
    expect(readPack(undefined, 'tverskoi')).toBeUndefined();
  });

  it('is newer only when it was built later', () => {
    expect(isNewer({ built: '2030-01-01T00:00:00Z' }, TVERSKOI_PACK)).toBe(true);
    expect(isNewer({ built: TVERSKOI_PACK.built }, TVERSKOI_PACK)).toBe(false);
    expect(isNewer({ built: '2000-01-01T00:00:00Z' }, TVERSKOI_PACK)).toBe(false);
    expect(isNewer(undefined, TVERSKOI_PACK)).toBe(false);
  });
});

describe('laws from GitHub, without a new version of the app', () => {
  it('downloads newer laws at start, uses them at once and keeps them for the next launch', async () => {
    const pack = newerPack();
    const { platform, user } = await renderApp({ platform: { remote: remote(pack) } });
    await vi.waitFor(() => expect(platform.state.laws.has('tverskoi')).toBe(true));
    expect(readPack(platform.state.laws.get('tverskoi'), 'tverskoi')?.built).toBe(pack.built);

    await user.type(search(), 'зеленоглазый');
    expect(within(screen.getByRole('list', { name: 'Результаты поиска' })).getAllByRole('listitem')[0]).toHaveTextContent('ст. 65');
    // No law changed its date: nothing to tell over the game.
    expect(platform.state.toast).toBeNull();
  });

  it('tells over the game when a law itself changed', async () => {
    const pack = newerPack({ version: '2030-01-01T00:00:00+03:00' });
    const { platform } = await renderApp({ platform: { remote: remote(pack) } });
    await vi.waitFor(() => expect(platform.state.toast).not.toBeNull());
    expect(platform.state.toast).toMatchObject({ title: 'Законы обновлены', text: expect.stringContaining('Тверской: актуально на 01.01.2030') });
  });

  it('starts with the laws kept from before when they are newer than those built in', async () => {
    const { platform, user } = await renderApp({ platform: { laws: { tverskoi: JSON.stringify(newerPack()) } } });
    await checked(platform);
    await user.type(search(), 'зеленоглазый');
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('ст. 65');
  });

  it('leaves laws written in a shape this app does not read for a newer app', async () => {
    const { platform } = await renderApp({ platform: { remote: remote(newerPack(), PACK_FORMAT + 1) } });
    await checked(platform);
    expect(platform.calls.filter((c) => c.method === 'download').map((c) => c.args[0])).toEqual([MANIFEST_URL]);
    expect(platform.state.laws.size).toBe(0);
  });

  it('does not go online by itself when automatic checks are off', async () => {
    const { platform } = await renderApp({ platform: { remote: remote(newerPack()) }, settings: { 'update.auto': false } });
    await vi.waitFor(() => expect(platform.calls.some((c) => c.method === 'readSetting' && c.args[0] === 'update.auto')).toBe(true));
    await act(async () => {});
    expect(platform.calls.some((c) => c.method === 'download')).toBe(false);
  });

  it('checks from the settings and says what it found', async () => {
    const { platform, user } = await renderApp({ platform: { remote: 'offline' } });
    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    const note = () => screen.getByRole('status', { name: 'Проверка законов' });
    await user.click(screen.getByRole('button', { name: 'Проверить законы' }));
    await vi.waitFor(() => expect(note()).toHaveTextContent('Нет связи с GitHub'));

    platform.state.remote = remote({ ...TVERSKOI_PACK });
    await user.click(screen.getByRole('button', { name: 'Проверить законы' }));
    await vi.waitFor(() => expect(note()).toHaveTextContent('Законы актуальны'));

    platform.state.remote = remote(newerPack());
    await user.click(screen.getByRole('button', { name: 'Проверить законы' }));
    await vi.waitFor(() => expect(note()).toHaveTextContent('Загружены новые законы'));
  });
});
