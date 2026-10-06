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
  kind: 'article' | 'calculator' | 'ai';
  /** Article: «УК ст. 88 ч. 1. Халатность»; calculator: the total, «30 мес». */
  heading: string;
  /** Stars to set, beside the calculator's total. */
  stars?: number;
  /** The punishment of the article's part, under the heading: a line per whom it is for. */
  punishment?: { who?: string; text: string }[];
  /** What comes on top of the punishment: «лишение права управления», «запись о судимости». */
  extra?: string[];
  /** The punishment of a rule of the project or of a charter — «Mute 60-240 минут», shown in red. */
  penalty?: string;
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
  /** How the cards of a block stand: one under another, or side by side. Set by the edge they were dropped on. */
  flow?: 'column' | 'row';
  /** A block of several shown a card at a time, flipped through like pages, so it stays small. */
  paged?: boolean;
  /** Only the heading and the punishment, without the article's text: many cards take little room. */
  compact?: boolean;
  cards: PinCard[];
}

/** A card's place on the screen, in physical pixels: everything else lets the mouse through. */
export interface PinArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A short notice over the game, top right of the main screen, that goes by itself after a few seconds. */
export interface Toast {
  id: string;
  title: string;
  text?: string;
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

/**
 * What the quick search asks of the overlay, where the calculator, the recent articles and the AI are: an article
 * (by its key, `uk-65#1`) into the calculator, one opened to the recent ones, the recent ones cleared, the
 * calculator or the AI shown, and — when the bar starts — what it should show.
 */
export type QuickRequest =
  | { kind: 'charge'; key: string }
  | { kind: 'remember'; key: string }
  | { kind: 'clear-recent' }
  | { kind: 'clear-charges' }
  | { kind: 'open-calculator' }
  | { kind: 'ask'; question: string }
  | { kind: 'hello' };

/** What the overlay tells the quick search: what is in its calculator and the recent articles, by key. */
export interface QuickState {
  charges: string[];
  recent: string[];
}

/** What the bar needs of the app: settings and laws to read, being shown and hidden, and asking the assistant. */
export interface QuickBridge {
  readSetting<T>(key: string): Promise<T | undefined>;
  readLaws(server: string): Promise<string | undefined>;
  /** Called each time the bar is shown by its key. */
  onShown(listener: () => void): () => void;
  hide(): Promise<void>;
  /** The assistant does it: an article into its calculator, a question to its AI… */
  request(request: QuickRequest): Promise<void>;
  /** What the assistant has: its calculator and the recent articles, told on every change. */
  onState(listener: (state: QuickState) => void): () => void;
  /** The window's height to what the bar shows, in CSS pixels: no invisible window over the game below it. */
  fit?(height: number): void;
}

/** How the pinned cards look: a theme id («glass», «dense», «minimal») and the accent hue. */
export interface PinLook {
  theme: string;
  hue: number;
}

export interface PlatformAdapter {
  readonly kind: 'browser' | 'tauri' | 'fake';

  /** Global hotkey that toggles the overlay while the game has focus. Replaces any previous one. */
  registerHotkey(accelerator: string, onPress: () => void): Promise<void>;
  unregisterHotkey(): Promise<void>;
  /**
   * The push-to-talk key for a question over the game: `onDown` when it is pressed, `onUp` when it is let go.
   * A second global hotkey beside the overlay's; replaces any previous one.
   */
  registerVoiceHotkey(accelerator: string, onDown: () => void, onUp: () => void): Promise<void>;
  unregisterVoiceHotkey(): Promise<void>;
  /** The quick search's own key (ticket 27): pressed, the bar shows at the top of the screen. Replaces any previous one. */
  registerQuickHotkey(accelerator: string): Promise<void>;
  unregisterQuickHotkey(): Promise<void>;
  /**
   * A key for one more thing done over the game — the detention timer, a phrase for the chat — under a name of
   * its own, so each is changed or let go apart. Like every key here, it rejects when Windows will not give the
   * key: another program holds it.
   */
  registerShortcut(id: string, accelerator: string, onPress: () => void): Promise<void>;
  unregisterShortcut(id: string): Promise<void>;
  /** What the quick search asks of the overlay: an article into the calculator, a question to the AI. Returns unsubscribe. */
  onQuickRequest(listener: (request: QuickRequest) => void): () => void;
  /** Tells the quick search what is in the calculator and the recent articles. */
  sendQuickState(state: QuickState): Promise<void>;

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
  /** Called when «Очистить» is pressed on the calculator's card over the game (issue #23). */
  onCalculatorCleared(listener: () => void): () => void;
  /** The theme and the accent hue the pinned cards are drawn in: the overlay's own, kept for the next start too. */
  setPinLook(look: PinLook): Promise<void>;
  /** Downloads a text file (the laws on GitHub). Throws when offline or when the file is not there. */
  download(url: string): Promise<string>;
  /** The laws of a server downloaded before, kept on the computer, or nothing. */
  readLaws(server: string): Promise<string | undefined>;
  writeLaws(server: string, text: string): Promise<void>;
  /** Shows a notice over the game — even while the overlay is hidden — that goes by itself. */
  showToast(toast: Toast): Promise<void>;
  /** «Запускать вместе с Windows»: asked of Windows itself, so it shows what really happens at logon. */
  getAutostart(): Promise<boolean>;
  setAutostart(on: boolean): Promise<void>;
  /**
   * Streamer mode: the overlay and the pinned cards stay on the screen but are left out of screen capture —
   * OBS, Discord, screenshots. Windows' own: set again at every start. Throws when Windows refuses.
   */
  setCaptureHidden(hidden: boolean): Promise<void>;

  writeClipboard(text: string): Promise<void>;

  readSetting<T>(key: string): Promise<T | undefined>;
  writeSetting<T>(key: string, value: T): Promise<void>;

  /** Opens a link in the user's browser, outside the overlay. */
  openExternal(url: string): Promise<void>;

  /** Where the browser comes back to after signing in: a listener of the app on this computer. */
  readonly signInRedirect: string;
  /**
   * Opens a sign-in page in the user's browser and waits until it comes back to `signInRedirect`;
   * returns the query string it came back with («code=…» or «error=…»). Throws «cancelled» after
   * `cancelSignIn` or when nobody comes back in ten minutes, «unsupported» where there is no listener.
   */
  signInInBrowser(url: string): Promise<string>;
  cancelSignIn(): Promise<void>;

  /** Asks the releases for a version newer than this one; `null` when this is the latest. Throws when offline. */
  checkForUpdate(): Promise<AppUpdate | null>;
  /**
   * Downloads the update the last check found, checks its signature and installs it; the app closes
   * for the installer and starts again as the new version.
   */
  installUpdate(onProgress: (progress: UpdateProgress) => void): Promise<void>;
}
