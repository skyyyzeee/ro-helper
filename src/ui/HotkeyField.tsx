import { Fragment, useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useTakenHotkey } from './hotkeys';
import { WarnIcon } from './icons';
import { captureHotkey, hasModifier, hotkeyKeys } from './profile';

/**
 * A key of the assistant, changed right here: press the field, then the combination. A key that may be off has a
 * switch at the end of its line — turned on, it takes `fallback`. In a list of many (`compact`) the line says how to
 * change it only while it listens.
 */
export function HotkeyField({
  hotkey,
  onHotkey,
  onCapturing,
  label = 'Открыть и скрыть оверлей',
  name,
  fallback,
  clash,
  compact = false,
}: {
  /** Empty when off. */
  hotkey: string;
  onHotkey: (accelerator: string) => void;
  onCapturing: (capturing: boolean) => void;
  label?: string;
  /** What the key is registered as (`hotkeys.ts`): held by another program, the field says so. */
  name?: string;
  /** The key a switch turns it on with; without it the key is always on. */
  fallback?: string;
  /** What else holds the same key, before this one (`keymap.ts`): this one does not work. */
  clash?: string;
  compact?: boolean;
}) {
  const taken = useTakenHotkey(name) === hotkey && !!hotkey;
  const [listening, setListening] = useState(false);
  const [unsupported, setUnsupported] = useState(false);

  // While a hotkey is being recorded the current one must be released, or Windows swallows the keys.
  useEffect(() => onCapturing(listening), [listening, onCapturing]);
  useEffect(() => () => onCapturing(false), [onCapturing]);

  const record = (event: ReactKeyboardEvent) => {
    if (!listening) return;
    event.preventDefault();
    // Esc here only stops the recording: it must not step back through the overlay as well.
    event.stopPropagation();
    if (event.key === 'Escape') {
      setListening(false);
      return;
    }
    const result = captureHotkey(event);
    if (result.kind === 'waiting') return;
    if (result.kind === 'unsupported') {
      setUnsupported(true);
      return;
    }
    setUnsupported(false);
    setListening(false);
    if (result.accelerator !== hotkey) onHotkey(result.accelerator);
  };

  const on = !!hotkey;
  const Item = compact ? 'div' : Fragment;
  return (
    <Item {...(compact ? { role: 'group', 'aria-label': label, className: 'keys__item' } : {})}>
      <div className="set__row">
        <span className={compact ? 'set__label keys__label' : 'set__label'}>{label}</span>
        <span className="sp" />
        {on && (
          <button
            type="button"
            className={listening ? 'ob__hotkey set__hotkey ob__hotkey--listen' : 'ob__hotkey set__hotkey'}
            aria-label={`${compact ? label : 'Горячая клавиша'}: ${listening ? 'нажмите сочетание' : hotkeyKeys(hotkey).join(' + ')}`}
            onClick={() => {
              setUnsupported(false);
              setListening(true);
            }}
            onBlur={() => setListening(false)}
            onKeyDown={record}
          >
            {listening ? (
              <span className="muted">Нажмите сочетание…</span>
            ) : (
              hotkeyKeys(hotkey).map((key) => (
                <span key={key} className="ob__key">
                  {key}
                </span>
              ))
            )}
          </button>
        )}
        {fallback !== undefined && (
          <button type="button" role="switch" aria-checked={on} aria-label={label} className={on ? 'switch switch--on' : 'switch'} onClick={() => onHotkey(on ? '' : fallback)}>
            <span className="switch__knob" />
          </button>
        )}
      </div>
      {on && clash && !listening && (
        <div className="warn" role="alert">
          <WarnIcon />
          <span>Это сочетание уже у «{clash}» — здесь оно не сработает. Задайте другое.</span>
        </div>
      )}
      {taken && !clash && !listening && (
        <div className="warn" role="alert">
          <WarnIcon />
          <span>Сочетание занято другой программой — клавиша не сработает. Задайте другое.</span>
        </div>
      )}
      {(!compact || listening) && on && <p className="set__hint">{listening ? 'Нажмите нужное сочетание. Esc — отмена.' : 'Нажмите на поле и задайте новое сочетание.'}</p>}
      {unsupported && <p className="set__hint">Эту клавишу назначить нельзя: подойдут буквы, цифры, F1–F24, пробел.</p>}
      {on && !hasModifier(hotkey) && (
        <div className="warn" role="alert">
          <WarnIcon />
          <span>Без Ctrl, Alt или Shift клавиша может пересечься с управлением в игре.</span>
        </div>
      )}
    </Item>
  );
}
