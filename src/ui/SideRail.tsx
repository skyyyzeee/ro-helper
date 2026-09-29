import { useEffect, useRef, type ReactNode } from 'react';

/** A section of the app in the side column. */
export interface RailItem {
  id: string;
  /** Its name: the tip over the icon and what a screen reader says. */
  label: string;
  icon: ReactNode;
  /** What a screen reader names it, when it is more than its label («Все документы»). */
  ariaLabel?: string;
  /** For a section that opens over the search and closes again: whether it is open. */
  expanded?: boolean;
  /** Ctrl and this number opens it. */
  shortcut?: number;
  /** At the foot of the column: the settings and the profile. */
  bottom?: boolean;
  /** Not there yet, or nothing to show: shown dimmed, with the reason as its tip. */
  disabled?: boolean;
  hint?: string;
  onSelect: () => void;
}

/**
 * The side column (direction C): icons only, always on screen, the server's mark on top, the sections under it and the
 * settings and the profile at its foot. Ctrl and a section's number opens it from the keyboard.
 */
export function SideRail({ top, items, current }: { top?: ReactNode; items: RailItem[]; current?: string }) {
  const latest = useRef(items);
  latest.current = items;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const digit = /^Digit([1-9])$/.exec(e.code);
      if (!digit || !e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return;
      const item = latest.current.find((i) => i.shortcut === Number(digit[1]));
      if (!item || item.disabled) return;
      e.preventDefault();
      item.onSelect();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const button = (item: RailItem) => (
    <button
      key={item.id}
      type="button"
      className="rail__item"
      aria-label={item.ariaLabel ?? item.label}
      aria-current={current === item.id ? 'page' : undefined}
      aria-expanded={item.expanded}
      disabled={item.disabled}
      title={item.hint ?? (item.shortcut ? `${item.label} · Ctrl+${item.shortcut}` : item.label)}
      onClick={item.onSelect}
    >
      {item.icon}
    </button>
  );

  return (
    <nav className="rail" aria-label="Разделы" data-tauri-drag-region>
      {top}
      {items.filter((item) => !item.bottom).map(button)}
      <span className="sp" data-tauri-drag-region />
      {items.filter((item) => item.bottom).map(button)}
    </nav>
  );
}
