// The servers' laws as the app uses them. What every window needs at once — which servers there are, their names and
// organisations — is `servers.json`, a few kilobytes written by `npm run import`. A server's pack, megabytes of laws,
// is loaded when it is used, and only that server's: the windows no longer read three servers' laws at start.
// Everything at once, for the tests and the scripts: ./bundled.
import type { Organization, ServerInfo, ServerPack } from '../core';
import servers from './servers.json';

/** What the app knows of a server before its laws are loaded. */
export interface ServerMeta {
  server: ServerInfo;
  organizations: Organization[];
}

/** Every server the app has laws for, by id, in the importer's order; the first is what a new profile starts on. */
export const SERVER_INFO = servers as unknown as Record<string, ServerMeta>;
const FIRST = Object.keys(SERVER_INFO)[0];

/** A server's id as the app has it: one it no longer has is the first one. */
export const knownServer = (server: string): string => (SERVER_INFO[server] ? server : FIRST);

/** The server and its organisations, at once. */
export const serverMeta = (server: string): ServerMeta => SERVER_INFO[knownServer(server)];

// One chunk a server: Vite splits each import() into a file of its own, read only when asked for.
const LOADERS: Record<string, () => Promise<{ default: unknown }>> = {
  tverskoi: () => import('./tverskoi.json'),
  arbatskiy: () => import('./arbatskiy.json'),
  kutuzovskiy: () => import('./kutuzovskiy.json'),
};
const loading = new Map<string, Promise<ServerPack>>();
const loaded = new Map<string, ServerPack>();

/** The laws built into the app for a server, loaded once and kept. */
export function loadPack(server: string): Promise<ServerPack> {
  const id = knownServer(server);
  let pack = loading.get(id);
  if (!pack) {
    pack = LOADERS[id]().then(({ default: json }) => {
      const read = json as ServerPack;
      loaded.set(id, read);
      return read;
    });
    loading.set(id, pack);
  }
  return pack;
}

/** The built-in pack of a server if it was loaded already, so a window shown again starts with it. */
export const loadedPack = (server: string): ServerPack | undefined => loaded.get(knownServer(server));
