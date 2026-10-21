import { useEffect, useRef, type ReactNode } from 'react';

/** A section of the app in the side column, or a tab of one over its page. */
export interface RailItem {
  id: string;
  /** Its name, under the icon in the column and on the tab. */
  label: string;
  icon?: ReactNode;
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

/** Ctrl and a number opens the section or the tab that has it, wherever it is on screen. */
function useShortcuts(items: RailItem[]) {
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
}

const tip = (item: RailItem) => item.hint ?? (item.shortcut ? `${item.label} · Ctrl+${item.shortcut}` : item.label);

/**
 * The side column (variant Б of the column's sketches): five sections with their names — Законы, ИИ, Служба, Вики,
 * Над игрой — the server's mark on top, the settings and the player at its foot. A section of several pages
 * has them as tabs over the page (`SectionTabs`); `keys` are those tabs, for Ctrl and their number.
 */
export function SideRail({ top, items, current, keys = [] }: { top?: ReactNode; items: RailItem[]; current?: string; keys?: RailItem[] }) {
  useShortcuts([...items, ...keys]);

  const button = (item: RailItem) => (
    <button
      key={item.id}
      type="button"
      className="rail__item"
      aria-label={item.ariaLabel ?? item.label}
      aria-current={current === item.id ? 'page' : undefined}
      aria-expanded={item.expanded}
      disabled={item.disabled}
      title={tip(item)}
      onClick={item.onSelect}
    >
      {item.icon}
      <span className="rail__label" aria-hidden="true">
        {item.label}
      </span>
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

/** The pages of the section open: «Поиск · Документы · Калькулятор» under the head of «Законы». */
export function SectionTabs({ label, tabs, current }: { label: string; tabs: RailItem[]; current?: string }) {
  return (
    <div className="section-tabs" role="group" aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className="section-tabs__tab"
          aria-label={tab.ariaLabel}
          aria-current={current === tab.id ? 'page' : undefined}
          aria-expanded={tab.expanded}
          disabled={tab.disabled}
          title={tip(tab)}
          onClick={tab.onSelect}
        >
          {tab.icon}
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );
}
