// Everything native lives behind this interface, so the UI never touches Tauri directly
// and can run in a browser or in tests with a fake.

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What a pinned card shows. Serializable: it is sent to a separate window. */
export interface PinCard {
  /** What it stands for: `uk-65#1` for an article's part, `calculator` for the total. */
  id: string;
  kind: 'article' | 'calculator';
  /** Article: «УК ст. 88 ч. 1. Халатность»; calculator: the total, «30 мес». */
  heading: string;
  /** Stars to set, beside the calculator's total. */
  stars?: number;
  /** In the accent colour under the heading: the article's punishment. */
  accent?: string;
  lines: string[];
  warning?: string;
}

/**
 * A block of pinned cards over the game, at the place the user dragged it to (CSS pixels of the
 * screen). A block holds several cards once they are dropped onto each other.
 */
export interface PinGroup {
  id: string;
  x: number;
  y: number;
  /** The size the user dragged the block to, in CSS pixels; without it, a card's width and its own height. */
  width?: number;
  height?: number;
  cards: PinCard[];
}

/** A card's place on the screen, in physical pixels: everything else lets the mouse through. */
export interface PinArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A newer version of the app, found in the GitHub releases. */
export interface AppUpdate {
  version: string;
  /** When it was released (ISO), if the release says. */
  date?: string;
  /** The release notes (Markdown): «Что нового», then how to install. */
  notes?: string;
}

/** Bytes of the update downloaded so far, and in all when the server says. */
export interface UpdateProgress {
  downloaded: number;
  total?: number;
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
  /**
   * Widens the window by `width` CSS pixels towards the centre of the screen, for a side panel
   * (the calculator), and says which side it grew on. The saved position stays that of the overlay alone.
   */
  extendWindow(width: number): Promise<'left' | 'right'>;
  /** Undoes `extendWindow`. */
  retractWindow(): Promise<void>;
  setAlwaysOnTop(on: boolean): Promise<void>;

  /**
   * What is pinned over the game: a transparent window that never takes the focus, with a block of
   * cards where the user put each. Clicks go through it while the overlay is hidden; while the overlay
   * is shown, the blocks can be dragged, joined and closed. An empty list hides it.
   */
  setPins(groups: PinGroup[]): Promise<void>;
  /** Called when the user moves, joins or closes something there. Returns an unsubscribe function. */
  onPinsChanged(listener: (groups: PinGroup[]) => void): () => void;

  writeClipboard(text: string): Promise<void>;

  readSetting<T>(key: string): Promise<T | undefined>;
  writeSetting<T>(key: string, value: T): Promise<void>;

  /** Opens a link in the user's browser, outside the overlay. */
  openExternal(url: string): Promise<void>;

  /** Asks the releases for a version newer than this one; `null` when this is the latest. Throws when offline. */
  checkForUpdate(): Promise<AppUpdate | null>;
  /**
   * Downloads the update the last check found, checks its signature and installs it; the app closes
   * for the installer and starts again as the new version.
   */
  installUpdate(onProgress: (progress: UpdateProgress) => void): Promise<void>;
}
