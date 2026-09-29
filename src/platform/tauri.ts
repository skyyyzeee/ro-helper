import { invoke } from '@tauri-apps/api/core';
import { emitTo, listen } from '@tauri-apps/api/event';
import { PhysicalPosition, PhysicalSize, availableMonitors, currentMonitor, getCurrentWindow, primaryMonitor } from '@tauri-apps/api/window';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { isRegistered, register, unregister } from '@tauri-apps/plugin-global-shortcut';
import { openUrl } from '@tauri-apps/plugin-opener';
import { load } from '@tauri-apps/plugin-store';
import { check, type Update } from '@tauri-apps/plugin-updater';
import type { PinArea, PinGroup, PinLook, PlatformAdapter, Toast, WindowBounds } from './types';

/** True inside the Tauri app, false in a plain browser. */
export function isTauri(): boolean {
  return '__TAURI_INTERNALS__' in window;
}

const BOUNDS_KEY = 'window.bounds';
/** Set once a copy has moved to the landscape window (2.0.3). */
const LANDSCAPE_KEY = 'window.landscape';
/** Emitted by the native side for the tray icon and a second launch of the app. */
const TOGGLE_EVENT = 'overlay-toggle';
/** The window of the pinned cards, and the events between it and the native side. */
const PIN_LABEL = 'pin';
const PIN_GROUPS_EVENT = 'pin-groups';
const PIN_LIVE_EVENT = 'pin-live';
/** What the user did on the cards themselves: moved, joined or closed one. */
const PIN_LAYOUT_EVENT = 'pin-layout';
/** A notice to show over the game. */
const PIN_TOAST_EVENT = 'pin-toast';
/** The theme and accent of the cards: sent by the overlay, and kept in the settings for the window's next start. */
const PIN_LOOK_EVENT = 'pin-look';
const PIN_LOOK_KEY = 'pin.look';
/**
 * The browser coming back from a sign-in, told by the native listener: the query string it brought,
 * or null when the sign-in was given up or timed out. `generation` tells one sign-in from the next.
 */
const SIGN_IN_EVENT = 'sign-in-back';
interface SignInBack {
  generation: number;
  query: string | null;
}

/** True in the window of the pinned cards, which renders them instead of the overlay. */
export function isPinWindow(): boolean {
  return isTauri() && getCurrentWindow().label === PIN_LABEL;
}

/** A notice as the pin window gets it: with the top right corner of the main screen's work area, in its physical pixels. */
export interface ShownToast extends Toast {
  corner?: { right: number; top: number };
}

/** What the window of the pinned cards needs from the native side. */
export interface PinBridge {
  /** What was pinned before the window loaded, and whether the overlay is open. */
  state(): Promise<{ groups: PinGroup[]; live: boolean; toast?: ShownToast | null }>;
  onGroups(listener: (groups: PinGroup[]) => void): () => void;
  onLive(listener: (live: boolean) => void): () => void;
  /** Tells the overlay what the user moved, joined or closed here. */
  layout(groups: PinGroup[]): Promise<void>;
  /** Where the cards are, in physical pixels: everywhere else the window lets the mouse through. */
  areas(areas: PinArea[]): Promise<void>;
  onToast(listener: (toast: ShownToast) => void): () => void;
  /** The notice has gone: the window may hide again when nothing is pinned. */
  toastDone(): Promise<void>;
  /** The look the overlay last gave the cards, and its changes. */
  look(): Promise<PinLook | undefined>;
  onLook(listener: (look: PinLook) => void): () => void;
}

export function createPinBridge(): PinBridge {
  const subscribe = <T,>(event: string, listener: (payload: T) => void) => {
    const unlisten = listen<T>(event, (e) => listener(e.payload));
    return () => void unlisten.then((stop) => stop());
  };
  return {
    state: () => invoke('pin_state'),
    onGroups: (listener) => subscribe(PIN_GROUPS_EVENT, listener),
    onLive: (listener) => subscribe(PIN_LIVE_EVENT, listener),
    layout: (groups) => invoke('pin_layout', { groups }),
    areas: (areas) => invoke('pin_areas', { areas }),
    onToast: (listener) => subscribe(PIN_TOAST_EVENT, listener),
    toastDone: () => invoke('pin_toast_done'),
    look: async () => (await load('settings.json', { defaults: {}, autoSave: 300 })).get<PinLook>(PIN_LOOK_KEY),
    onLook: (listener) => subscribe(PIN_LOOK_EVENT, listener),
  };
}

/**
 * The real platform: a frameless, transparent, always-on-top window over the game.
 * Restores the saved window position (or the right third of the screen) before showing it.
 */
export async function createTauriPlatform(): Promise<PlatformAdapter> {
  const win = getCurrentWindow();
  const store = await load('settings.json', { defaults: {}, autoSave: 300 });
  const shownListeners = new Set<() => void>();
  let visible = false;
  let hotkey: string | null = null;
  let voiceHotkey: string | null = null;

  /**
   * A landscape window at the right of the work area (screen minus taskbar), centred top to bottom, in
   * physical pixels: the side column, and the search wide enough for a result on one line.
   */
  const defaultBounds = async (): Promise<WindowBounds> => {
    const monitor = (await currentMonitor()) ?? (await primaryMonitor());
    if (!monitor) return { x: 100, y: 100, width: 900, height: 620 };
    const { position, size } = monitor.workArea;
    const scale = monitor.scaleFactor;
    const margin = Math.round(24 * scale);
    const width = Math.round(Math.min(Math.max(size.width * 0.42, 820 * scale), 1040 * scale, size.width - 2 * margin));
    const height = Math.round(Math.min(Math.max(width * 0.7, 520 * scale), size.height - 2 * margin));
    return { x: position.x + size.width - width - margin, y: position.y + Math.round((size.height - height) / 2), width, height };
  };

  /** A saved position is only reused if the window would still be on some screen. */
  const onSomeScreen = async (b: WindowBounds): Promise<boolean> =>
    (await availableMonitors()).some(
      (m) => b.x < m.position.x + m.size.width && b.x + b.width > m.position.x && b.y < m.position.y + m.size.height && b.y + b.height > m.position.y,
    );

  const applyBounds = async (b: WindowBounds) => {
    await win.setSize(new PhysicalSize(b.width, b.height));
    await win.setPosition(new PhysicalPosition(b.x, b.y));
  };

  const currentBounds = async (): Promise<WindowBounds> => {
    const position = await win.outerPosition();
    const size = await win.outerSize();
    return { x: position.x, y: position.y, width: size.width, height: size.height };
  };

  // Up to 2.0.2 the window opened as a tall column: a copy that kept that shape gets the landscape
  // window once. A window made tall again after that is the player's choice and stays.
  let saved = await store.get<WindowBounds>(BOUNDS_KEY);
  if (!(await store.get<boolean>(LANDSCAPE_KEY))) {
    if (saved && saved.height > saved.width) saved = undefined;
    await store.set(LANDSCAPE_KEY, true);
  }
  await applyBounds(saved && (await onSomeScreen(saved)) ? saved : await defaultBounds());

  /** While the calculator is out, the window is wider than the overlay by this much (physical px). */
  let extension: { side: 'left' | 'right'; width: number; cssWidth: number } | null = null;
  /** The overlay's own bounds, without the side panel. */
  const baseOf = (b: WindowBounds): WindowBounds => {
    if (!extension) return b;
    const width = b.width - extension.width;
    return extension.side === 'left' ? { ...b, x: b.x + extension.width, width } : { ...b, width };
  };

  let saveTimer: number | undefined;
  const saveBoundsSoon = () => {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(async () => store.set(BOUNDS_KEY, baseOf(await currentBounds())), 400);
  };

  const extendWindow = async (cssWidth: number): Promise<'left' | 'right'> => {
    if (extension) return extension.side;
    const width = Math.round(cssWidth * (await win.scaleFactor()));
    const b = await currentBounds();
    const monitor = (await currentMonitor()) ?? (await primaryMonitor());
    const centre = monitor ? monitor.position.x + monitor.size.width / 2 : b.x;
    const side = b.x + b.width / 2 > centre ? 'left' : 'right';
    extension = { side, width, cssWidth };
    await applyBounds(side === 'left' ? { ...b, x: b.x - width, width: b.width + width } : { ...b, width: b.width + width });
    return side;
  };
  const retractWindow = async () => {
    if (!extension) return;
    const base = baseOf(await currentBounds());
    extension = null;
    await applyBounds(base);
    await store.set(BOUNDS_KEY, base);
  };
  await win.onMoved(saveBoundsSoon);
  await win.onResized(saveBoundsSoon);

  const showOverlay = async () => {
    await invoke('remember_foreground');
    await win.show();
    await win.setAlwaysOnTop(true);
    await win.setFocus();
    visible = true;
    // While the overlay is open, the pinned card can be dragged and closed.
    await invoke('pin_live', { live: true });
    shownListeners.forEach((listener) => listener());
  };
  const hideOverlay = async () => {
    await win.hide();
    visible = false;
    await invoke('pin_live', { live: false });
    await invoke('restore_foreground');
  };
  const toggleOverlay = () => (visible ? hideOverlay() : showOverlay());

  // Hotkey calls run one after another: React may register, unregister and register again in a row,
  // and a page reload leaves the previous page's registration in place.
  let hotkeyQueue: Promise<void> = Promise.resolve();
  const queueHotkey = (task: () => Promise<void>) => (hotkeyQueue = hotkeyQueue.then(task, task));

  await listen(TOGGLE_EVENT, () => void toggleOverlay());
  const pinListeners = new Set<(groups: PinGroup[]) => void>();
  await listen<PinGroup[]>(PIN_LAYOUT_EVENT, (event) => pinListeners.forEach((listener) => listener(event.payload)));

  /** The update the last check found, to install. */
  let found: Update | null = null;

  const platform: PlatformAdapter = {
    kind: 'tauri',

    registerHotkey: (accelerator, onPress) =>
      queueHotkey(async () => {
        if (hotkey) await unregister(hotkey);
        if (await isRegistered(accelerator)) await unregister(accelerator);
        await register(accelerator, (event) => {
          if (event.state === 'Pressed') onPress();
        });
        hotkey = accelerator;
      }),
    // Push-to-talk: the key reports being pressed and being let go; a key held down repeats «pressed», which
    // the overlay ignores while it already records.
    registerVoiceHotkey: (accelerator, onDown, onUp) =>
      queueHotkey(async () => {
        if (voiceHotkey) await unregister(voiceHotkey);
        if (await isRegistered(accelerator)) await unregister(accelerator);
        await register(accelerator, (event) => (event.state === 'Pressed' ? onDown() : onUp()));
        voiceHotkey = accelerator;
      }),
    unregisterVoiceHotkey: () =>
      queueHotkey(async () => {
        if (voiceHotkey) await unregister(voiceHotkey);
        voiceHotkey = null;
      }),
    unregisterHotkey: () =>
      queueHotkey(async () => {
        if (hotkey) await unregister(hotkey);
        hotkey = null;
      }),

    showOverlay,
    hideOverlay,
    toggleOverlay,
    onOverlayShown(listener) {
      shownListeners.add(listener);
      return () => shownListeners.delete(listener);
    },

    getWindowBounds: currentBounds,
    async setWindowBounds(bounds) {
      await applyBounds(bounds);
      await store.set(BOUNDS_KEY, bounds);
    },
    async resetWindowBounds() {
      const open = extension;
      extension = null;
      const bounds = await defaultBounds();
      await applyBounds(bounds);
      await store.set(BOUNDS_KEY, bounds);
      if (open) await extendWindow(open.cssWidth);
    },
    startResize: (edge) => win.startResizeDragging(edge),
    extendWindow,
    retractWindow,
    setAlwaysOnTop: (on) => win.setAlwaysOnTop(on),

    setPins: (groups) => invoke('pin_set', { groups }),
    async setPinLook(look) {
      await store.set(PIN_LOOK_KEY, look);
      await emitTo(PIN_LABEL, PIN_LOOK_EVENT, look);
    },
    showToast: (toast) => invoke('pin_toast', { toast }),
    async download(url) {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      return response.text();
    },
    readLaws: async (server) => (await invoke<string | null>('laws_read', { server })) ?? undefined,
    writeLaws: (server, text) => invoke('laws_write', { server, text }),
    onPinsChanged(listener) {
      pinListeners.add(listener);
      return () => pinListeners.delete(listener);
    },

    writeClipboard: (text) => writeText(text),
    readSetting: <T,>(key: string) => store.get<T>(key),
    writeSetting: (key, value) => store.set(key, value),
    openExternal: (url) => openUrl(url),

    signInRedirect: 'http://127.0.0.1:47321/auth/callback',
    async signInInBrowser(url) {
      // Listening before the listener starts: the answer can't be missed, and is matched to this sign-in.
      const heard: SignInBack[] = [];
      let settle: ((back: SignInBack) => void) | null = null;
      let generation: number | null = null;
      const unlisten = await listen<SignInBack>(SIGN_IN_EVENT, (event) => {
        heard.push(event.payload);
        if (event.payload.generation === generation) settle?.(event.payload);
      });
      try {
        generation = await invoke<number>('sign_in_listen');
        const back = new Promise<SignInBack>((resolve) => {
          settle = resolve;
          const early = heard.find((b) => b.generation === generation);
          if (early) resolve(early);
        });
        await openUrl(url).catch(async (error: unknown) => {
          await invoke('sign_in_cancel');
          throw error;
        });
        const { query } = await back;
        if (query === null) throw new Error('cancelled');
        return query;
      } finally {
        unlisten();
      }
    },
    cancelSignIn: () => invoke('sign_in_cancel'),

    async checkForUpdate() {
      found = await check();
      return found && { version: found.version, date: found.date, notes: found.body };
    },
    async installUpdate(onProgress) {
      if (!found) throw new Error('No update to install: check first');
      let downloaded = 0;
      let total: number | undefined;
      // On Windows the app exits as the installer starts; the installer starts the new version.
      await found.downloadAndInstall((event) => {
        if (event.event === 'Started') total = event.data.contentLength;
        if (event.event === 'Progress') downloaded += event.data.chunkLength;
        onProgress({ downloaded, total });
      });
    },
  };

  await showOverlay();
  return platform;
}
