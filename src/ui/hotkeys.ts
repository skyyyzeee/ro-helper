import { useSyncExternalStore } from 'react';
import type { PlatformAdapter } from '../platform/types';
import { formatHotkey } from './profile';

/**
 * The keys Windows would not give the assistant — another program holds them — by what each is for. A key that
 * could not be registered does nothing when pressed, and nothing else would tell the player why: the settings
 * show it beside the key, and a notice over the game says it once (issue #40).
 */
const taken = new Map<string, string>();
/** The latest registration of each key: an older one answering late changes nothing. */
const attempts = new Map<string, number>();
/** What was already told over the game. */
const told = new Set<string>();
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/**
 * Follows a key being registered: taken by another program, it is remembered as such and told over the game —
 * `whatFails` is what will not work, «Быстрый поиск по ней не откроется»; null keeps it to the settings.
 */
export function trackHotkey(platform: PlatformAdapter, name: string, accelerator: string, registration: Promise<void>, whatFails: string | null): void {
  const attempt = (attempts.get(name) ?? 0) + 1;
  attempts.set(name, attempt);
  registration.then(
    () => {
      if (attempts.get(name) === attempt && taken.delete(name)) changed();
    },
    () => {
      if (attempts.get(name) !== attempt) return;
      taken.set(name, accelerator);
      changed();
      // Without words for it, the place that set the key says it itself: nine keys are not nine notices.
      if (whatFails === null) return;
      // Said once for a key: the registration is tried again whenever another key changes.
      if (told.has(`${name} ${accelerator}`)) return;
      told.add(`${name} ${accelerator}`);
      void platform.showToast({
        id: `hotkey-${name}-${accelerator}`,
        title: `Клавиша ${formatHotkey(accelerator)} занята другой программой`,
        text: `${whatFails} Выберите другую: «Настройки» → «Клавиши».`,
      });
    },
  );
}

/** The key is let go, or about to be registered anew: what was known of it is forgotten. */
export function forgetHotkey(name: string): void {
  attempts.set(name, (attempts.get(name) ?? 0) + 1);
  if (taken.delete(name)) changed();
}

/** The key of this name that another program holds, if the last try to register it failed. */
export function useTakenHotkey(name: string | undefined): string | undefined {
  return useSyncExternalStore(subscribe, () => (name ? taken.get(name) : undefined));
}

/** The keys whose names start so that another program holds: the phrases' nine are «phrase-1»…«phrase-9». */
export function useTakenHotkeys(prefix: string): string[] {
  const joined = useSyncExternalStore(subscribe, () =>
    [...taken]
      .filter(([name]) => name.startsWith(prefix))
      .map(([, accelerator]) => accelerator)
      .join('\n'),
  );
  return joined ? joined.split('\n') : [];
}
