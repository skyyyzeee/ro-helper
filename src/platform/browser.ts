import { createFakePlatform } from './fake';
import type { AppUpdate, PlatformAdapter } from './types';

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

/** An update to show in the preview: `localStorage['preview.update'] = '{"version":"1.1.0"}'`. */
function previewUpdate(): AppUpdate | undefined {
  try {
    const raw = window.localStorage.getItem('preview.update');
    return raw ? (JSON.parse(raw) as AppUpdate) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Browser preview: no global hotkey or extra windows, but real clipboard, links and settings.
 * There is nothing to update; an update can be staged to look at the offer.
 */
export function createBrowserPlatform(): PlatformAdapter {
  const fake = createFakePlatform({ kind: 'browser', storage: safeLocalStorage(), update: previewUpdate() });
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
