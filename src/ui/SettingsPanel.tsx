import { usePlatform } from '../platform/PlatformContext';
import { DEFAULT_HOTKEY, MAX_OPACITY, MIN_OPACITY, formatHotkey } from './overlaySettings';

/** Overlay settings for now: background transparency and window position. Server, organisation and hotkey come with ticket 07. */
export function SettingsPanel({ opacity, onOpacity }: { opacity: number; onOpacity: (value: number) => void }) {
  const platform = usePlatform();
  const transparency = Math.round((1 - opacity) * 100);

  return (
    <div className="settings" role="group" aria-label="Настройки">
      <label className="settings__row">
        <span>Прозрачность фона</span>
        <span className="sp" />
        <span className="settings__value">{transparency}%</span>
      </label>
      <input
        className="settings__slider"
        type="range"
        aria-label="Прозрачность фона"
        min={Math.round((1 - MAX_OPACITY) * 100)}
        max={Math.round((1 - MIN_OPACITY) * 100)}
        step={1}
        value={transparency}
        onChange={(e) => onOpacity(1 - Number(e.target.value) / 100)}
      />
      {platform.kind !== 'browser' && (
        <button className="settings__button" type="button" onClick={() => void platform.resetWindowBounds()}>
          Сбросить положение окна
        </button>
      )}
      <div className="settings__row settings__row--muted">
        <span>Горячая клавиша</span>
        <span className="sp" />
        <span className="kbd">{formatHotkey(DEFAULT_HOTKEY)}</span>
      </div>
    </div>
  );
}
