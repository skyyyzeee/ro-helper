import { useCallback, useEffect, useRef, useState } from 'react';
import { PACK_FORMAT, type ServerPack } from '../core';
import { loadPack, loadedPack } from '../data';
import { usePlatform } from '../platform/PlatformContext';
import { formatDate } from './lawBits';
import { AUTO_KEY, CHECK_EVERY_MS } from './updates';

/**
 * Where installed copies take newer laws without a new version of the app: the packs on the main branch
 * of the repository, which `npm run import` writes and a push publishes.
 */
export const LAWS_BASE = 'https://raw.githubusercontent.com/skyyyzeee/ro-helper/main/src/data';
export const MANIFEST_URL = `${LAWS_BASE}/manifest.json`;
export const packUrl = (server: string) => `${LAWS_BASE}/${server}.json`;

/** What the repository has: each server's pack and when it was built, in the shape the packs are written. */
export interface LawsManifest {
  format: number;
  packs: Record<string, { built?: string; version: string }>;
}

export type LawsStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  /** After a check from the settings: nothing newer, or GitHub could not be reached. */
  | { kind: 'latest' }
  | { kind: 'offline' }
  /** Newer laws were downloaded and are in use. */
  | { kind: 'updated'; version: string };

const time = (iso: string | undefined) => (iso ? Date.parse(iso) || 0 : 0);

/** Whether a pack (or its line in the manifest) was built after the one in use. */
export const isNewer = (candidate: { built?: string } | undefined, current: ServerPack): boolean =>
  !!candidate && time(candidate.built) > time(current.built);

/**
 * A pack read from a file: taken only when it is whole, for this server and in the shape this app reads —
 * anything else is as good as no file.
 */
export function readPack(text: string | undefined, server: string): ServerPack | undefined {
  if (!text) return undefined;
  try {
    const pack = JSON.parse(text) as ServerPack;
    const whole =
      pack?.format === PACK_FORMAT &&
      pack.server?.id === server &&
      typeof pack.version === 'string' &&
      typeof pack.built === 'string' &&
      Array.isArray(pack.documents) &&
      pack.documents.length > 0 &&
      Array.isArray(pack.organizations) &&
      Array.isArray(pack.changes);
    return whole ? pack : undefined;
  } catch {
    return undefined;
  }
}

/** The pack if it is this server's: the one before stays on screen while another server's loads. */
const ofServer = (pack: ServerPack | undefined, server: string): ServerPack | undefined => (pack?.server.id === server ? pack : undefined);

export interface Laws {
  /** The laws in use: the ones the app came with, or newer ones downloaded since; none until they are read. */
  pack: ServerPack | undefined;
  status: LawsStatus;
  /** Asks GitHub for newer laws now, whether or not the app checks by itself. */
  check: () => void;
}

/**
 * The laws of a server: those built into the app, replaced by newer ones downloaded from GitHub — kept on
 * the computer for the next launch. The app asks at start and every few hours, with the updates of the
 * app, unless their automatic checks are off. Until the profile is known (`null`) it does nothing.
 */
export function useLaws(server: string | null): Laws {
  const platform = usePlatform();
  const [pack, setPack] = useState<ServerPack | undefined>(() => (server ? loadedPack(server) : undefined));
  const [status, setStatus] = useState<LawsStatus>({ kind: 'idle' });
  // Read inside the downloads, which outlive a render: the pack in use and the server it is for.
  const current = useRef(pack);
  const serverRef = useRef(server);
  const busy = useRef(false);

  const use = (next: ServerPack | undefined) => {
    current.current = next;
    setPack(next);
  };

  // The server's built-in laws, loaded with its server's alone, then the ones downloaded before if they are newer.
  // Another server chosen, the laws of the one before stay on screen the moment the new ones take to load — the
  // overlay is not taken down and put up again around them.
  useEffect(() => {
    serverRef.current = server;
    setStatus({ kind: 'idle' });
    if (!server) return use(undefined);
    const ready = loadedPack(server);
    if (ready && !ofServer(current.current, server)) use(ready);
    let active = true;
    void loadPack(server).then(async (built) => {
      if (!active) return;
      const now = ofServer(current.current, server);
      if (!now || isNewer(built, now)) use(built);
      const kept = readPack(await platform.readLaws(server).catch(() => undefined), server);
      if (active && kept && isNewer(kept, ofServer(current.current, server) ?? built)) use(kept);
    });
    return () => {
      active = false;
    };
  }, [platform, server]);

  const run = useCallback(
    async (manual: boolean) => {
      if (!server || busy.current) return;
      busy.current = true;
      if (manual) setStatus({ kind: 'checking' });
      const stillHere = () => serverRef.current === server;
      try {
        // The laws in use for this server — or what the app came with, should the check come before they are read.
        const base = ofServer(current.current, server) ?? (await loadPack(server));
        const manifest = JSON.parse(await platform.download(MANIFEST_URL)) as LawsManifest;
        // A pack in a shape this app does not know waits for the app to be updated.
        const entry = manifest?.format === PACK_FORMAT ? manifest.packs?.[server] : undefined;
        if (!isNewer(entry, ofServer(current.current, server) ?? base)) {
          if (manual && stillHere()) setStatus({ kind: 'latest' });
          return;
        }
        const text = await platform.download(packUrl(server));
        const next = readPack(text, server);
        if (!next || !isNewer(next, ofServer(current.current, server) ?? base) || !stillHere()) {
          if (manual && stillHere()) setStatus({ kind: 'latest' });
          return;
        }
        // Not kept for the next launch is no reason not to use them now.
        await platform.writeLaws(server, text).catch(() => undefined);
        const previous = ofServer(current.current, server) ?? base;
        use(next);
        setStatus({ kind: 'updated', version: next.version });
        // Told over the game only when a law itself changed, not the way the helper reads them.
        if (next.version !== previous.version) {
          void platform.showToast({
            id: `laws-${server}-${next.built}`,
            title: 'Законы обновлены',
            text: `${next.server.name}: актуально на ${formatDate(next.version)}. Что изменилось — в ассистенте.`,
          });
        }
      } catch {
        // Offline at start is normal: said only when asked.
        if (manual && stillHere()) setStatus({ kind: 'offline' });
      } finally {
        busy.current = false;
      }
    },
    [platform, server],
  );

  // By itself at start and every few hours, as the updates of the app, and only while those are on.
  useEffect(() => {
    if (!server) return;
    let stopped = false;
    const tick = () =>
      void platform.readSetting<boolean>(AUTO_KEY).then((on) => {
        if (!stopped && on !== false) void run(false);
      });
    tick();
    const timer = setInterval(tick, CHECK_EVERY_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [platform, server, run]);

  return { pack, status, check: () => void run(true) };
}
