import { useEffect, useState } from 'react';
import { usePlatform } from '../platform/PlatformContext';
import { loadWiki } from '../wiki/catalog';
import { WIKI_FORMAT, type WikiData, type WikiManifest } from '../wiki/model';
import { LAWS_BASE } from './laws';
import { AUTO_KEY, CHECK_EVERY_MS } from './updates';

/**
 * Where installed copies take a newer wiki without a new version of the app — as the laws: `npm run wiki:import`
 * and `wiki:build` write it, a push to main publishes it. The manifest is a few bytes: the wiki itself, megabytes,
 * is downloaded only when it is newer.
 */
export const WIKI_URL = `${LAWS_BASE}/wiki.json`;
export const WIKI_MANIFEST_URL = `${LAWS_BASE}/wiki-manifest.json`;
/** Kept beside the downloaded laws, under a name no server has. */
const STORE = 'wiki';
/** When the repository was last asked: not more often than the app's updates, however often the section opens. */
const CHECKED_KEY = 'wiki.checked';

const time = (iso: string | undefined) => (iso ? Date.parse(iso) || 0 : 0);

/** A wiki read from a file: taken only whole and in the shape this app reads — anything else is as good as none. */
export function readWiki(text: string | undefined): WikiData | undefined {
  if (!text) return undefined;
  try {
    const data = JSON.parse(text) as WikiData;
    const whole =
      data?.format === WIKI_FORMAT &&
      typeof data.takenAt === 'string' &&
      Array.isArray(data.catalogs) &&
      Array.isArray(data.entries) &&
      data.entries.length > 0 &&
      // What the view iterates must be lists: one entry without them would break the whole section.
      data.entries.every((e) => typeof e?.id === 'string' && typeof e.title === 'string' && Array.isArray(e.tags) && Array.isArray(e.facts) && Array.isArray(e.sources));
    return whole ? data : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The wiki to show: the one the app came with, or one downloaded before if newer — at once; then, as the app's
 * updates (unless they are off, and at most every few hours), a newer one from the repository, kept for next time.
 */
export function useWiki(): { data: WikiData | null; failed: boolean } {
  const platform = usePlatform();
  const [data, setData] = useState<WikiData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      let best: WikiData;
      try {
        best = await loadWiki();
      } catch {
        if (active) setFailed(true);
        return;
      }
      const kept = readWiki(await platform.readLaws(STORE).catch(() => undefined));
      if (kept && time(kept.takenAt) > time(best.takenAt)) best = kept;
      if (!active) return;
      setData(best);

      try {
        if ((await platform.readSetting<boolean>(AUTO_KEY)) === false) return;
        const checked = (await platform.readSetting<number>(CHECKED_KEY)) ?? 0;
        if (Date.now() - checked < CHECK_EVERY_MS) return;
        await platform.writeSetting(CHECKED_KEY, Date.now());
        const manifest = JSON.parse(await platform.download(WIKI_MANIFEST_URL)) as WikiManifest;
        if (manifest?.format !== WIKI_FORMAT || time(manifest.takenAt) <= time(best.takenAt)) return;
        const text = await platform.download(WIKI_URL);
        const next = readWiki(text);
        if (!next || time(next.takenAt) <= time(best.takenAt)) return;
        await platform.writeLaws(STORE, text).catch(() => undefined);
        if (active) setData(next);
      } catch {
        // Offline, or the repository has none yet: the wiki at hand is shown.
      }
    })();
    return () => {
      active = false;
    };
  }, [platform]);

  return { data, failed };
}
