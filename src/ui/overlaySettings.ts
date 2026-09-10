/** Temporary default until the first-launch flow lets the user choose (ticket 07). */
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

/** «Alt+Q» → «Alt + Q». */
export function formatHotkey(accelerator: string): string {
  return accelerator.split('+').join(' + ');
}
