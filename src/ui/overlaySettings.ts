/**
 * Default hotkey. Alt+Q was checked in game on Тверской (ticket 06): GTA V leaves the Alt+Q combination
 * free (Q alone, «cover», still reaches the game) and nothing in Russia Online collided with it.
 */
export const DEFAULT_HOTKEY = 'Alt+Q';

export const OPACITY_KEY = 'overlay.opacity';
/** Background opacity of the glass, 0–1; the mockup's value. */
export const DEFAULT_OPACITY = 0.62;
export const MIN_OPACITY = 0.35;
export const MAX_OPACITY = 0.95;

export function clampOpacity(value: number): number {
  return Math.min(MAX_OPACITY, Math.max(MIN_OPACITY, value));
}

/** Applies the glass opacity to the whole overlay through the `--glass-alpha` token. */
export function applyOpacity(value: number): void {
  document.documentElement.style.setProperty('--glass-alpha', String(clampOpacity(value)));
}

/**
 * The push-to-talk key for a question over the game; an empty setting turns it off. Alt+W sits beside the
 * overlay's Alt+Q; unlike Alt+Q it has not been checked in game, so the settings let the player change it.
 */
export const VOICE_HOTKEY_KEY = 'voice.hotkey';
export const DEFAULT_VOICE_HOTKEY = 'Alt+W';

/** The quick search's own key (ticket 27): the bar at the top of the screen; an empty setting turns it off. */
export const QUICK_HOTKEY_KEY = 'quick.hotkey';
export const DEFAULT_QUICK_HOTKEY = 'Alt+S';

/** The detention timer's key (issue #40): starts and stops the count over the game; an empty setting turns it off. */
export const TIMER_HOTKEY_KEY = 'timer.hotkey';
export const DEFAULT_TIMER_HOTKEY = 'Ctrl+Shift+T';

/** Streamer mode: the app is left out of screen capture (OBS, Discord, screenshots). Windows' own, set at every start. */
export const STREAMER_KEY = 'overlay.streamer';
