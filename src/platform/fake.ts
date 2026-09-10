import type { PinCard, PlatformAdapter, WindowBounds } from './types';

export interface FakeCall {
  method: keyof PlatformAdapter;
  args: unknown[];
}

export interface FakePlatform extends PlatformAdapter {
  /** Every adapter call, in order. */
  readonly calls: FakeCall[];
  readonly settings: Map<string, unknown>;
  readonly state: { overlayVisible: boolean; hotkey: string | null; pin: PinCard | null; clipboard: string };
  /** Simulates the user pressing the registered global hotkey. */
  pressHotkey(): void;
}

export interface FakeOptions {
  kind?: PlatformAdapter['kind'];
  /** Backing store for settings; defaults to memory. */
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
}

/** In-memory adapter for tests and the browser preview. Records every call. */
export function createFakePlatform(options: FakeOptions = {}): FakePlatform {
  const calls: FakeCall[] = [];
  const settings = new Map<string, unknown>();
  const shownListeners = new Set<() => void>();
  const state: FakePlatform['state'] = { overlayVisible: true, hotkey: null, pin: null, clipboard: '' };
  let onHotkey: (() => void) | null = null;
  let bounds: WindowBounds | null = null;

  const record = (method: keyof PlatformAdapter, ...args: unknown[]) => {
    calls.push({ method, args });
  };

  return {
    kind: options.kind ?? 'fake',
    calls,
    settings,
    state,

    pressHotkey() {
      onHotkey?.();
    },

    async registerHotkey(accelerator, onPress) {
      record('registerHotkey', accelerator);
      state.hotkey = accelerator;
      onHotkey = onPress;
    },
    async unregisterHotkey() {
      record('unregisterHotkey');
      state.hotkey = null;
      onHotkey = null;
    },

    async showOverlay() {
      record('showOverlay');
      state.overlayVisible = true;
      shownListeners.forEach((listener) => listener());
    },
    async hideOverlay() {
      record('hideOverlay');
      state.overlayVisible = false;
    },
    onOverlayShown(listener) {
      shownListeners.add(listener);
      return () => shownListeners.delete(listener);
    },

    async getWindowBounds() {
      record('getWindowBounds');
      return bounds;
    },
    async setWindowBounds(next) {
      record('setWindowBounds', next);
      bounds = next;
    },
    async resetWindowBounds() {
      record('resetWindowBounds');
      bounds = null;
    },
    async setAlwaysOnTop(on) {
      record('setAlwaysOnTop', on);
    },

    async showPin(card) {
      record('showPin', card);
      state.pin = card;
    },
    async hidePin() {
      record('hidePin');
      state.pin = null;
    },
    async setPinClickThrough(on) {
      record('setPinClickThrough', on);
    },

    async writeClipboard(text) {
      record('writeClipboard', text);
      state.clipboard = text;
    },

    async readSetting<T>(key: string) {
      record('readSetting', key);
      if (options.storage) {
        const raw = options.storage.getItem(key);
        return raw == null ? undefined : (JSON.parse(raw) as T);
      }
      return settings.get(key) as T | undefined;
    },
    async writeSetting(key, value) {
      record('writeSetting', key, value);
      if (options.storage) options.storage.setItem(key, JSON.stringify(value));
      else settings.set(key, value);
    },

    async openExternal(url) {
      record('openExternal', url);
    },
  };
}
