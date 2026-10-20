import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installNativeFeel } from './nativeFeel';

const key = (init: KeyboardEventInit) => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  document.body.dispatchEvent(event);
  return event.defaultPrevented;
};

describe('the app, not a web page (skyze: «остаются стандартные браузерные темы»)', () => {
  let stop: () => void;
  beforeEach(() => {
    document.body.innerHTML = '<div id="card">Статья</div><input id="field" /><button id="pin" title="Закрепить поверх игры">📌</button>';
    stop = installNativeFeel();
  });
  afterEach(() => {
    stop();
    vi.useRealTimers();
  });

  it('shows no browser menu, but keeps it in a field (cut, copy, paste)', () => {
    const menu = (id: string) => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      document.getElementById(id)!.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(menu('card')).toBe(true);
    expect(menu('field')).toBe(false);
  });

  it('keeps the browser’s keys from reloading, printing or going back — and leaves the app’s own', () => {
    expect(key({ key: 'F5' })).toBe(true);
    expect(key({ key: 'r', code: 'KeyR', ctrlKey: true })).toBe(true);
    expect(key({ key: 'p', code: 'KeyP', ctrlKey: true })).toBe(true);
    expect(key({ key: 'ArrowLeft', altKey: true })).toBe(true);
    expect(key({ key: 'c', code: 'KeyC', ctrlKey: true })).toBe(false);
    expect(key({ key: 'ArrowLeft' })).toBe(false);
    expect(key({ key: 'Escape' })).toBe(false);
  });

  it('draws its own tooltip instead of the system’s, and gives the title back', () => {
    vi.useFakeTimers();
    const pin = document.getElementById('pin')!;
    pin.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    expect(pin.hasAttribute('title')).toBe(false);
    vi.advanceTimersByTime(500);
    const tip = document.querySelector<HTMLElement>('.tip')!;
    expect(tip.hidden).toBe(false);
    expect(tip.textContent).toBe('Закрепить поверх игры');

    pin.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: document.body }));
    expect(tip.hidden).toBe(true);
    expect(pin.getAttribute('title')).toBe('Закрепить поверх игры');
  });
});
