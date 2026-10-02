import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { CheckIcon, ChevronDownIcon } from './icons';

export interface DropdownOption {
  value: string;
  label: string;
  /** What the option is known by, set apart before its label: «УК», «6-ФЗ». */
  lead?: string;
}

/**
 * A choice of one from a list, drawn by the assistant itself: the system draws a select's list its own way —
 * grey, square, light — whatever the page asks for. ↑↓ walk the list, Enter picks, Esc closes it.
 */
export function Dropdown({ label, value, options, onChange, className }: { label: string; value: string; options: DropdownOption[]; onChange: (value: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  /** As tall as the room under the button allows: what does not fit is scrolled to, not cut off. */
  const [room, setRoom] = useState<number>();
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const current = Math.max(options.findIndex((o) => o.value === value), 0);

  const show = () => {
    setActive(current);
    setOpen(true);
  };
  const pick = (index: number) => {
    setOpen(false);
    if (options[index] && options[index].value !== value) onChange(options[index].value);
  };

  useLayoutEffect(() => {
    if (!open || !root.current) return;
    // The nearest block that cuts off or scrolls what is in it: the list must end inside it.
    let frame: HTMLElement | null = root.current.parentElement;
    while (frame && getComputedStyle(frame).overflowY === 'visible') frame = frame.parentElement;
    const bottom = frame ? frame.getBoundingClientRect().bottom : window.innerHeight;
    setRoom(Math.max(120, Math.min(280, bottom - root.current.getBoundingClientRect().bottom - 14)));
  }, [open]);

  // A click anywhere else closes the list.
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  useEffect(() => {
    if (open) list.current?.querySelector('.dd__option--active')?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active]);

  const onKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        show();
      }
      return;
    }
    if (event.key === 'Escape') {
      // Only the list closes: the assistant stays.
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      setOpen(false);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((now) => Math.min(Math.max(now + (event.key === 'ArrowDown' ? 1 : -1), 0), options.length - 1));
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      pick(active);
    } else if (event.key === 'Tab') setOpen(false);
  };

  const chosen = options[current];
  return (
    <div className={className ? `dd ${className}` : 'dd'} ref={root}>
      <button
        type="button"
        className={open ? 'dd__button dd__button--open' : 'dd__button'}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKey}
      >
        <span className="dd__value">
          {chosen?.lead && <b>{chosen.lead}</b>}
          {chosen?.lead ? ` — ${chosen.label}` : chosen?.label}
        </span>
        <ChevronDownIcon />
      </button>
      {open && (
        <ul className="dd__list" role="listbox" aria-label={label} ref={list} style={room ? { maxHeight: room } : undefined}>
          {options.map((option, index) => (
            <li
              key={option.value}
              role="option"
              aria-selected={index === current}
              className={['dd__option', index === active && 'dd__option--active', index === current && 'dd__option--on'].filter(Boolean).join(' ')}
              onMouseEnter={() => setActive(index)}
              // Before the button loses the focus: the list must still be there for the click.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(index)}
            >
              {option.lead && <span className="dd__lead">{option.lead}</span>}
              <span className="dd__label">{option.label}</span>
              {index === current && <CheckIcon size={14} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
