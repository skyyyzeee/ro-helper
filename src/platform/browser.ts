import { createFakePlatform } from './fake';
import type { PlatformAdapter } from './types';

/** Settings survive reloads when the browser allows storage; otherwise they live in memory. */
function safeLocalStorage(): Pick<Storage, 'getItem' | 'setItem'> | undefined {
  try {
    const probe = '__ro_helper_probe__';
    window.localStorage.setItem(probe, probe);
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/** Browser preview: no global hotkey or extra windows, but real clipboard, links and settings. */
export function createBrowserPlatform(): PlatformAdapter {
  const fake = createFakePlatform({ kind: 'browser', storage: safeLocalStorage() });
  return {
    ...fake,
    async writeClipboard(text) {
      await fake.writeClipboard(text);
      await navigator.clipboard?.writeText(text).catch(() => undefined);
    },
    async openExternal(url) {
      await fake.openExternal(url);
      window.open(url, '_blank', 'noopener');
    },
  };
}
