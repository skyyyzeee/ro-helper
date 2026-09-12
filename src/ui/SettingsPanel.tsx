import type { Organization } from '../core';
import { usePlatform } from '../platform/PlatformContext';
import { APP_VERSION, AUTHOR, LINKS } from './about';
import { DiscordIcon, GitHubIcon } from './icons';
import { MAX_OPACITY, MIN_OPACITY } from './overlaySettings';
import { formatHotkey } from './profile';
import type { Updates } from './updates';

/** What a check from the settings found, beside its button. */
function updateNote(status: Updates['status']): string | null {
  switch (status.kind) {
    case 'checking':
      return 'Проверяю…';
    case 'latest':
      return 'Установлена последняя версия';
    case 'offline':
      return 'Нет связи с GitHub';
    case 'available':
    case 'failed':
      return `Доступна версия ${status.update.version}`;
    case 'installing':
      return 'Обновляю…';
    default:
      return null;
  }
}

/**
 * Overlay settings: server, organisation and hotkey (changed in the first-launch steps), transparency, window
 * position; «Что изменилось», updates, and about the app.
 */
export function SettingsPanel({
  summary,
  hotkey,
  opacity,
  onOpacity,
  onEditProfile,
  onChanges,
  updates,
  onPrivacy,
  organization,
  onOrganization,
}: {
  /** «Тверской · МВД». */
  summary: string;
  hotkey: string;
  opacity: number;
  onOpacity: (value: number) => void;
  onEditProfile: () => void;
  /** Opens «Что изменилось» for the recent updates of the laws. */
  onChanges: () => void;
  updates: Updates;
  /** Opens the privacy policy. */
  onPrivacy: () => void;
  organization?: Organization;
  /** Opens the choice of organisation on its own, without the other settings. */
  onOrganization: () => void;
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
      <div className="settings__row">
        <span>Организация: {organization?.name ?? 'не выбрана'}</span>
        <span className="sp" />
        <button className="settings__button" type="button" onClick={onOrganization}>
          Сменить
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
      <button className="settings__button" type="button" onClick={onChanges}>
        Что изменилось в законах
      </button>
      {platform.kind !== 'browser' && (
        <button className="settings__button" type="button" onClick={() => void platform.resetWindowBounds()}>
          Сбросить положение окна
        </button>
      )}
      <div className="settings__row settings__about">
        <span>
          РО Хелпер {APP_VERSION} · автор {AUTHOR}
        </span>
        <span className="sp" />
        <button className="icon-btn icon-btn--sm" type="button" aria-label="GitHub" title="GitHub" onClick={() => void platform.openExternal(LINKS.repository)}>
          <GitHubIcon />
        </button>
        <button className="icon-btn icon-btn--sm" type="button" aria-label="Discord" title="Discord" onClick={() => void platform.openExternal(LINKS.discord)}>
          <DiscordIcon />
        </button>
      </div>
      <div className="settings__row">
        <button className="settings__button" type="button" disabled={updates.status.kind === 'checking' || updates.status.kind === 'installing'} onClick={updates.check}>
          Проверить обновления
        </button>
        <span className="settings__note" role="status">
          {updateNote(updates.status)}
        </span>
      </div>
      <label className="settings__row settings__check">
        <input type="checkbox" checked={updates.auto} onChange={(e) => updates.setAuto(e.target.checked)} />
        <span>Проверять обновления автоматически</span>
      </label>
      <button className="link settings__privacy" type="button" onClick={onPrivacy}>
        Политика конфиденциальности
      </button>
    </div>
  );
}
