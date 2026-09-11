import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { LogicalSize, PhysicalPosition, PhysicalSize, availableMonitors, currentMonitor, getCurrentWindow, primaryMonitor } from '@tauri-apps/api/window';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { isRegistered, register, unregister } from '@tauri-apps/plugin-global-shortcut';
import { openUrl } from '@tauri-apps/plugin-opener';
import { load } from '@tauri-apps/plugin-store';
import type { PinCard, PlatformAdapter, WindowBounds } from './types';

/** True inside the Tauri app, false in a plain browser. */
export function isTauri(): boolean {
  return '__TAURI_INTERNALS__' in window;
}

const BOUNDS_KEY = 'window.bounds';
/** Emitted by the native side for the tray icon and a second launch of the app. */
const TOGGLE_EVENT = 'overlay-toggle';
/** The pinned card's window, and the events between it and the native side. */
const PIN_LABEL = 'pin';
const PIN_CARD_EVENT = 'pin-card';
const PIN_LIVE_EVENT = 'pin-live';
const PIN_CLOSED_EVENT = 'pin-closed';

/** True in the pinned card's window, which renders the card instead of the overlay. */
export function isPinWindow(): boolean {
  return isTauri() && getCurrentWindow().label === PIN_LABEL;
}

/** What the pinned card's window needs from the native side. */
export interface PinBridge {
  /** The card pinned before the window loaded, and whether the overlay is open. */
  state(): Promise<{ card: PinCard | null; live: boolean }>;
  onCard(listener: (card: PinCard) => void): () => void;
  onLive(listener: (live: boolean) => void): () => void;
  /** The card's own cross. */
  close(): Promise<void>;
  /** Sizes the window to the card, so its empty corners do not cover the overlay. */
  fit(width: number, height: number): Promise<void>;
}

export function createPinBridge(): PinBridge {
  const subscribe = <T,>(event: string, listener: (payload: T) => void) => {
    const unlisten = listen<T>(event, (e) => listener(e.payload));
    return () => void unlisten.then((stop) => stop());
  };
  return {
    state: () => invoke('pin_state'),
    onCard: (listener) => subscribe(PIN_CARD_EVENT, listener),
    onLive: (listener) => subscribe(PIN_LIVE_EVENT, listener),
    close: () => invoke('pin_hide', { fromCard: true }),
    fit: (width, height) => getCurrentWindow().setSize(new LogicalSize(width, height)),
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

  /** The right third of the work area (screen minus taskbar), with a margin, in physical pixels. */
  const defaultBounds = async (): Promise<WindowBounds> => {
    const monitor = (await currentMonitor()) ?? (await primaryMonitor());
    if (!monitor) return { x: 100, y: 100, width: 600, height: 900 };
    const { position, size } = monitor.workArea;
    const scale = monitor.scaleFactor;
    const margin = Math.round(24 * scale);
    const width = Math.round(Math.min(Math.max(size.width / 3, 480 * scale), 760 * scale));
    return { x: position.x + size.width - width - margin, y: position.y + margin, width, height: size.height - 2 * margin };
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

  const saved = await store.get<WindowBounds>(BOUNDS_KEY);
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
  const pinClosedListeners = new Set<() => void>();
  await listen(PIN_CLOSED_EVENT, () => pinClosedListeners.forEach((listener) => listener()));

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

    showPin: (card) => invoke('pin_show', { card }),
    hidePin: () => invoke('pin_hide'),
    onPinClosed(listener) {
      pinClosedListeners.add(listener);
      return () => pinClosedListeners.delete(listener);
    },

    writeClipboard: (text) => writeText(text),
    readSetting: <T,>(key: string) => store.get<T>(key),
    writeSetting: (key, value) => store.set(key, value),
    openExternal: (url) => openUrl(url),
  };

  await showOverlay();
  return platform;
}
