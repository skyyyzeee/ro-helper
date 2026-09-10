/** What the user chose on first launch; changed later in the settings. */
export interface Profile {
  server: string;
  organization: string;
  /** Tauri accelerator, e.g. «Alt+Q». */
  hotkey: string;
}

export const PROFILE_KEY = 'profile';

export interface ServerChoice {
  id: string;
  name: string;
  status: 'active' | 'soon';
  note?: string;
}

/** Russia Online servers. Only Тверской has laws for now; the others are listed as coming. */
export const SERVERS: ServerChoice[] = [
  { id: 'tverskoi', name: 'Тверской', status: 'active' },
  { id: 'arbatskiy', name: 'Арбатский', status: 'soon' },
  { id: 'kutuzovskiy', name: 'Кутузовский', status: 'soon', note: 'для новичков' },
];

const MODIFIERS = ['Ctrl', 'Alt', 'Shift'];
const NAMED_KEYS = new Set(['Space', 'Backquote', 'Insert', 'Delete', 'Home', 'End', 'PageUp', 'PageDown']);

/** A key event as far as hotkey capture cares. */
export interface KeyPress {
  code: string;
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export type Capture = { kind: 'waiting' } | { kind: 'unsupported' } | { kind: 'done'; accelerator: string };

/**
 * Turns a key press into an accelerator: «Ctrl+Shift+L», «Alt+Q», «F9». A lone modifier keeps waiting
 * for the main key; keys the global hotkey cannot use are rejected.
 */
export function captureHotkey(press: KeyPress): Capture {
  if (['Control', 'Alt', 'Shift', 'Meta', 'AltGraph'].includes(press.key)) return { kind: 'waiting' };
  // The physical key (`code`) keeps a Russian layout from mattering. Synthetic events may lack it;
  // then a Latin letter, digit, F-key or space in `key` is enough.
  const code = press.code || (press.key === ' ' ? 'Space' : /^[a-z]$/i.test(press.key) ? `Key${press.key.toUpperCase()}` : /^\d$/.test(press.key) ? `Digit${press.key}` : press.key);
  const letter = code.match(/^Key([A-Z])$/);
  const digit = code.match(/^Digit(\d)$/);
  const fkey = code.match(/^F([1-9]|1\d|2[0-4])$/);
  const main = letter?.[1] ?? digit?.[1] ?? (fkey ? `F${fkey[1]}` : NAMED_KEYS.has(code) ? code : null);
  if (!main) return { kind: 'unsupported' };
  const mods = [press.ctrlKey && 'Ctrl', press.altKey && 'Alt', press.shiftKey && 'Shift'].filter(Boolean) as string[];
  return { kind: 'done', accelerator: [...mods, main].join('+') };
}

/** Without Ctrl, Alt or Shift a hotkey easily collides with the game's own keys. */
export function hasModifier(accelerator: string): boolean {
  return accelerator.split('+').some((part) => MODIFIERS.includes(part));
}

const KEY_LABELS: Record<string, string> = { Backquote: 'Ё', PageUp: 'PgUp', PageDown: 'PgDn', Delete: 'Del', Insert: 'Ins' };

/** «Alt+Q» → ["Alt", "Q"]: keys as shown on keycaps. */
export function hotkeyKeys(accelerator: string): string[] {
  return accelerator.split('+').map((part) => KEY_LABELS[part] ?? part);
}

/** «Alt+Q» → «Alt + Q». */
export function formatHotkey(accelerator: string): string {
  return hotkeyKeys(accelerator).join(' + ');
}
