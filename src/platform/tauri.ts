import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { PhysicalPosition, PhysicalSize, availableMonitors, currentMonitor, getCurrentWindow, primaryMonitor } from '@tauri-apps/api/window';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { isRegistered, register, unregister } from '@tauri-apps/plugin-global-shortcut';
import { openUrl } from '@tauri-apps/plugin-opener';
import { load } from '@tauri-apps/plugin-store';
import type { PlatformAdapter, WindowBounds } from './types';

/** True inside the Tauri app, false in a plain browser. */
export function isTauri(): boolean {
  return '__TAURI_INTERNALS__' in window;
}

const BOUNDS_KEY = 'window.bounds';
/** Emitted by the native side for the tray icon and a second launch of the app. */
const TOGGLE_EVENT = 'overlay-toggle';

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

  let saveTimer: number | undefined;
  const saveBoundsSoon = () => {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(async () => store.set(BOUNDS_KEY, await currentBounds()), 400);
  };
  await win.onMoved(saveBoundsSoon);
  await win.onResized(saveBoundsSoon);

  const showOverlay = async () => {
    await invoke('remember_foreground');
    await win.show();
    await win.setAlwaysOnTop(true);
    await win.setFocus();
    visible = true;
    shownListeners.forEach((listener) => listener());
  };
  const hideOverlay = async () => {
    await win.hide();
    visible = false;
    await invoke('restore_foreground');
  };
  const toggleOverlay = () => (visible ? hideOverlay() : showOverlay());

  // Hotkey calls run one after another: React may register, unregister and register again in a row,
  // and a page reload leaves the previous page's registration in place.
  let hotkeyQueue: Promise<void> = Promise.resolve();
  const queueHotkey = (task: () => Promise<void>) => (hotkeyQueue = hotkeyQueue.then(task, task));

  await listen(TOGGLE_EVENT, () => void toggleOverlay());

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
      const bounds = await defaultBounds();
      await applyBounds(bounds);
      await store.set(BOUNDS_KEY, bounds);
    },
    startResize: (edge) => win.startResizeDragging(edge),
    setAlwaysOnTop: (on) => win.setAlwaysOnTop(on),

    // The pinned card window arrives with ticket 12.
    async showPin() {},
    async hidePin() {},
    async setPinClickThrough() {},

    writeClipboard: (text) => writeText(text),
    readSetting: <T,>(key: string) => store.get<T>(key),
    writeSetting: (key, value) => store.set(key, value),
    openExternal: (url) => openUrl(url),
  };

  await showOverlay();
  return platform;
}
