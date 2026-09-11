import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlatform } from '../platform/PlatformContext';
import type { AppUpdate } from '../platform/types';

/** How often the running app asks for a new version, besides at start. */
export const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
/** The version the user put off with «Позже»: not offered again until a newer one. */
export const DISMISSED_KEY = 'update.dismissed';

export type UpdateStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  /** After a check from the settings: this is the latest version, or GitHub could not be reached. */
  | { kind: 'latest' }
  | { kind: 'offline' }
  | { kind: 'available'; update: AppUpdate }
  | { kind: 'installing'; update: AppUpdate; percent?: number }
  | { kind: 'failed'; update: AppUpdate };

export interface Updates {
  status: UpdateStatus;
  /** Whether the overlay offers the update: found, not put off, or being installed. */
  offered: boolean;
  /** A check from the settings: says what it found, and offers even a version put off before. */
  check: () => void;
  install: () => void;
  later: () => void;
}

/** New versions of the app: asked for at start and every few hours, offered in the overlay, installed on request. */
export function useUpdates(): Updates {
  const platform = usePlatform();
  const [status, setStatus] = useState<UpdateStatus>({ kind: 'idle' });
  const [dismissed, setDismissed] = useState<string | undefined>();
  const busy = useRef(false);

  const run = useCallback(
    async (manual: boolean) => {
      if (busy.current) return;
      busy.current = true;
      if (manual) setStatus({ kind: 'checking' });
      try {
        const update = await platform.checkForUpdate();
        if (update) {
          if (manual) setDismissed(undefined);
          setStatus({ kind: 'available', update });
        } else setStatus(manual ? { kind: 'latest' } : { kind: 'idle' });
      } catch {
        // Offline at start is normal: say so only when asked.
        setStatus((current) => (manual ? { kind: 'offline' } : current));
      } finally {
        busy.current = false;
      }
    },
    [platform],
  );

  useEffect(() => {
    void platform.readSetting<string>(DISMISSED_KEY).then(setDismissed);
    void run(false);
    const timer = setInterval(() => void run(false), CHECK_EVERY_MS);
    return () => clearInterval(timer);
  }, [platform, run]);

  const install = () => {
    if (status.kind !== 'available' && status.kind !== 'failed') return;
    const { update } = status;
    busy.current = true;
    setStatus({ kind: 'installing', update });
    platform
      .installUpdate(({ downloaded, total }) =>
        setStatus({ kind: 'installing', update, percent: total ? Math.min(100, Math.round((downloaded / total) * 100)) : undefined }),
      )
      .catch(() => setStatus({ kind: 'failed', update }))
      .finally(() => {
        busy.current = false;
      });
  };

  const later = () => {
    if (status.kind !== 'available' && status.kind !== 'failed') return;
    setDismissed(status.update.version);
    void platform.writeSetting(DISMISSED_KEY, status.update.version);
    setStatus({ kind: 'idle' });
  };

  const offered =
    status.kind === 'installing' || status.kind === 'failed' || (status.kind === 'available' && status.update.version !== dismissed);

  return { status, offered, check: () => void run(true), install, later };
}
