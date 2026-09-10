import { describe, expect, it } from 'vitest';
import { captureHotkey, formatHotkey, hasModifier, type KeyPress } from './profile';

const press = (code: string, key: string, mods: Partial<KeyPress> = {}): KeyPress => ({
  code,
  key,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe('hotkey capture', () => {
  it('turns a key press into an accelerator, modifiers first', () => {
    expect(captureHotkey(press('KeyQ', 'q', { altKey: true }))).toEqual({ kind: 'done', accelerator: 'Alt+Q' });
    expect(captureHotkey(press('KeyL', 'L', { ctrlKey: true, shiftKey: true }))).toEqual({ kind: 'done', accelerator: 'Ctrl+Shift+L' });
    expect(captureHotkey(press('Digit5', '%', { shiftKey: true }))).toEqual({ kind: 'done', accelerator: 'Shift+5' });
    expect(captureHotkey(press('F9', 'F9'))).toEqual({ kind: 'done', accelerator: 'F9' });
    expect(captureHotkey(press('Backquote', 'ё', { altKey: true }))).toEqual({ kind: 'done', accelerator: 'Alt+Backquote' });
  });

  it('reads the physical key, so a Russian keyboard layout gives the same result', () => {
    expect(captureHotkey(press('KeyQ', 'й', { altKey: true }))).toEqual({ kind: 'done', accelerator: 'Alt+Q' });
  });

  it('falls back to the key when an event carries no physical code', () => {
    expect(captureHotkey(press('', 'l', { ctrlKey: true, shiftKey: true }))).toEqual({ kind: 'done', accelerator: 'Ctrl+Shift+L' });
    expect(captureHotkey(press('', 'F9'))).toEqual({ kind: 'done', accelerator: 'F9' });
    expect(captureHotkey(press('', 'й', { altKey: true }))).toEqual({ kind: 'unsupported' });
  });

  it('waits while only a modifier is held and rejects keys a global hotkey cannot use', () => {
    expect(captureHotkey(press('AltLeft', 'Alt', { altKey: true }))).toEqual({ kind: 'waiting' });
    expect(captureHotkey(press('Minus', '-'))).toEqual({ kind: 'unsupported' });
  });

  it('knows which hotkeys have a modifier and shows them as keycaps', () => {
    expect(hasModifier('Alt+Q')).toBe(true);
    expect(hasModifier('F9')).toBe(false);
    expect(formatHotkey('Alt+Backquote')).toBe('Alt + Ё');
  });
});
