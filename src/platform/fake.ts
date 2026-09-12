import type { AppUpdate, PinGroup, PlatformAdapter, ResizeEdge, WindowBounds } from './types';

export interface FakeCall {
  method: keyof PlatformAdapter;
  args: unknown[];
}

export interface FakePlatform extends PlatformAdapter {
  /** Every adapter call, in order. */
  readonly calls: FakeCall[];
  readonly settings: Map<string, unknown>;
  readonly state: {
    overlayVisible: boolean;
    hotkey: string | null;
    /** What is pinned over the game, block by block. */
    pins: PinGroup[];
    clipboard: string;
    /** What the releases offer: a newer version, none, or no connection. */
    update: AppUpdate | null | 'offline';
    updateInstalled: boolean;
  };
  /** Simulates the user pressing the registered global hotkey. */
  pressHotkey(): void;
  /** Simulates what the user does on the pinned cards themselves: closing, moving, joining. */
  changePins(groups: PinGroup[]): void;
}

export interface FakeOptions {
  kind?: PlatformAdapter['kind'];
  /** Backing store for settings; defaults to memory. */
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  /** A newer version the releases offer; none by default. */
  update?: AppUpdate | 'offline';
}

/** In-memory adapter for tests and the browser preview. Records every call. */
export function createFakePlatform(options: FakeOptions = {}): FakePlatform {
  const calls: FakeCall[] = [];
  const settings = new Map<string, unknown>();
  const shownListeners = new Set<() => void>();
  const pinListeners = new Set<(groups: PinGroup[]) => void>();
  const state: FakePlatform['state'] = {
    overlayVisible: true,
    hotkey: null,
    pins: [],
    clipboard: '',
    update: options.update ?? null,
    updateInstalled: false,
  };
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
    changePins(groups) {
      state.pins = groups;
      pinListeners.forEach((listener) => listener(groups));
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
    async toggleOverlay() {
      record('toggleOverlay');
      if (state.overlayVisible) {
        state.overlayVisible = false;
      } else {
        state.overlayVisible = true;
        shownListeners.forEach((listener) => listener());
      }
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
    async startResize(edge: ResizeEdge) {
      record('startResize', edge);
    },
    async extendWindow(width) {
      record('extendWindow', width);
      return 'left';
    },
    async retractWindow() {
      record('retractWindow');
    },
    async setAlwaysOnTop(on) {
      record('setAlwaysOnTop', on);
    },

    async setPins(groups) {
      record('setPins', groups);
      state.pins = groups;
    },
    onPinsChanged(listener) {
      pinListeners.add(listener);
      return () => pinListeners.delete(listener);
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

    async checkForUpdate() {
      record('checkForUpdate');
      if (state.update === 'offline') throw new Error('offline');
      return state.update;
    },
    async installUpdate(onProgress) {
      record('installUpdate');
      onProgress({ downloaded: 0, total: 100 });
      onProgress({ downloaded: 100, total: 100 });
      state.updateInstalled = true;
    },
  };
}
