import { usePlatform } from '../platform/PlatformContext';
import { MAX_OPACITY, MIN_OPACITY } from './overlaySettings';
import { formatHotkey } from './profile';

/** Overlay settings: server, organisation and hotkey (changed in the first-launch steps), transparency, window position. */
export function SettingsPanel({
  summary,
  hotkey,
  opacity,
  onOpacity,
  onEditProfile,
}: {
  /** «Тверской · МВД». */
  summary: string;
  hotkey: string;
  opacity: number;
  onOpacity: (value: number) => void;
  onEditProfile: () => void;
}) {
  const platform = usePlatform();
  const transparency = Math.round((1 - opacity) * 100);

  return (
    <div className="settings" role="group" aria-label="Настройки">
      <div className="settings__row">
        <span>{summary}</span>
        <span className="kbd">{formatHotkey(hotkey)}</span>
        <span className="sp" />
        <button className="settings__button" type="button" onClick={onEditProfile}>
          Изменить
        </button>
      </div>
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
    </div>
  );
}
