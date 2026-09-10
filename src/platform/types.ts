// Everything native lives behind this interface, so the UI never touches Tauri directly
// and can run in a browser or in tests with a fake.

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What the pinned card shows. Serializable: it is sent to a separate window. */
export interface PinCard {
  heading: string;
  lines: string[];
  warning?: string;
}

/** Edge or corner of the frameless overlay window being dragged to resize it. */
export type ResizeEdge = 'East' | 'North' | 'NorthEast' | 'NorthWest' | 'South' | 'SouthEast' | 'SouthWest' | 'West';

export interface PlatformAdapter {
  readonly kind: 'browser' | 'tauri' | 'fake';

  /** Global hotkey that toggles the overlay while the game has focus. Replaces any previous one. */
  registerHotkey(accelerator: string, onPress: () => void): Promise<void>;
  unregisterHotkey(): Promise<void>;

  /** Shows the overlay and gives it focus. */
  showOverlay(): Promise<void>;
  /** Hides the overlay and hands focus back to the game. */
  hideOverlay(): Promise<void>;
  /** Shows the overlay if hidden, hides it if shown: what the hotkey and the tray icon do. */
  toggleOverlay(): Promise<void>;
  /** Called every time the overlay becomes visible. Returns an unsubscribe function. */
  onOverlayShown(listener: () => void): () => void;

  getWindowBounds(): Promise<WindowBounds | null>;
  setWindowBounds(bounds: WindowBounds): Promise<void>;
  /** Puts the window back where it opens by default: the right third of the screen. */
  resetWindowBounds(): Promise<void>;
  /** Starts resizing the frameless window from an edge, following the mouse until it is released. */
  startResize(edge: ResizeEdge): Promise<void>;
  setAlwaysOnTop(on: boolean): Promise<void>;

  /** Pinned card: a separate transparent always-on-top window. */
  showPin(card: PinCard): Promise<void>;
  hidePin(): Promise<void>;
  setPinClickThrough(on: boolean): Promise<void>;

  writeClipboard(text: string): Promise<void>;

  readSetting<T>(key: string): Promise<T | undefined>;
  writeSetting<T>(key: string, value: T): Promise<void>;

  /** Opens a link in the user's browser, outside the overlay. */
  openExternal(url: string): Promise<void>;
}
