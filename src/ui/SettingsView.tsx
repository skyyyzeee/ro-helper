import { useEffect, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import type { Organization, ServerPack } from '../core';
import { usePlatform } from '../platform/PlatformContext';
import { APP_VERSION, AUTHOR, LINKS } from './about';
import { BackIcon, CloseIcon, DiscordIcon, GitHubIcon, WarnIcon } from './icons';
import { formatDate } from './lawBits';
import { MAX_OPACITY, MIN_OPACITY } from './overlaySettings';
import { captureHotkey, hasModifier, hotkeyKeys } from './profile';
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

/** One block of the settings, with its heading. */
function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="set" aria-label={title}>
      <h3 className="set__title">{title}</h3>
      <div className="set__rows">{children}</div>
    </section>
  );
}

/** A line of a block: what it is on the left, the value and the control on the right. */
function Row({ label, value, children }: { label: string; value?: ReactNode; children?: ReactNode }) {
  return (
    <div className="set__row">
      <span className="set__label">{label}</span>
      {value !== undefined && <span className="set__value">{value}</span>}
      <span className="sp" />
      {children}
    </div>
  );
}

/** The hotkey, changed right here: press the field, then the combination. */
function HotkeyField({ hotkey, onHotkey, onCapturing }: { hotkey: string; onHotkey: (accelerator: string) => void; onCapturing: (capturing: boolean) => void }) {
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

  return (
    <>
      <div className="set__row">
        <span className="set__label">Открыть и скрыть оверлей</span>
        <span className="sp" />
        <button
          type="button"
          className={listening ? 'ob__hotkey set__hotkey ob__hotkey--listen' : 'ob__hotkey set__hotkey'}
          aria-label={`Горячая клавиша: ${listening ? 'нажмите сочетание' : hotkeyKeys(hotkey).join(' + ')}`}
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
      </div>
      <p className="set__hint">{listening ? 'Нажмите нужное сочетание. Esc — отмена.' : 'Нажмите на поле и задайте новое сочетание.'}</p>
      {unsupported && <p className="set__hint">Эту клавишу назначить нельзя: подойдут буквы, цифры, F1–F24, пробел.</p>}
      {!hasModifier(hotkey) && (
        <div className="warn" role="alert">
          <WarnIcon />
          <span>Без Ctrl, Alt или Shift клавиша может пересечься с управлением в игре.</span>
        </div>
      )}
    </>
  );
}

/** «1 карточка», «3 карточки», «5 карточек». */
function cardsLabel(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (n === 0) return 'Ничего не закреплено';
  if (mod10 === 1 && mod100 !== 11) return `${n} карточка`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} карточки`;
  return `${n} карточек`;
}

/** Saving what is pinned now as a set, under a name or the next free one. */
function PresetForm({ disabled, placeholder, onSave }: { disabled: boolean; placeholder: string; onSave: (name: string) => void }) {
  const [name, setName] = useState('');
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (disabled) return;
    onSave(name);
    setName('');
  };
  return (
    <form className="set__row presets__form" onSubmit={save}>
      <input
        className="presets__input"
        type="text"
        aria-label="Название набора"
        placeholder={placeholder}
        value={name}
        maxLength={40}
        disabled={disabled}
        onChange={(e) => setName(e.target.value)}
        // Esc in the field clears it, not the settings.
        onKeyDown={(e) => {
          if (e.key === 'Escape' && name) {
            e.stopPropagation();
            setName('');
          }
        }}
      />
      <button className="settings__button" type="submit" disabled={disabled} title={disabled ? 'Сначала закрепите статьи' : undefined}>
        Сохранить набор
      </button>
    </form>
  );
}

export interface SettingsViewProps {
  backLabel: string;
  onBack: () => void;
  pack: ServerPack;
  organization?: Organization;
  /** Opens the choice of server, and of organisation, each on its own screen. */
  onServer: () => void;
  onOrganization: () => void;
  /** The first-launch steps again: server, organisation and hotkey in a row. */
  onEditProfile: () => void;
  hotkey: string;
  onHotkey: (accelerator: string) => void;
  onCapturing: (capturing: boolean) => void;
  opacity: number;
  onOpacity: (value: number) => void;
  /** Cards pinned over the game: how many, and unpinning them all at once. */
  pinned: number;
  onUnpinAll: () => void;
  /** Saved sets of pinned cards, what the next one is called unless named, and saving, showing, deleting one. */
  presets: { id: string; name: string; count: number }[];
  nextPresetName: string;
  onSavePreset: (name: string) => void;
  onApplyPreset: (id: string) => void;
  onDeletePreset: (id: string) => void;
  /** Opens «Что изменилось» for the recent updates of the laws. */
  onChanges: () => void;
  updates: Updates;
  onPrivacy: () => void;
}

/** The settings screen: what the helper works with, how it looks, the laws, updates and the app itself. */
export function SettingsView({
  backLabel,
  onBack,
  pack,
  organization,
  onServer,
  onOrganization,
  onEditProfile,
  hotkey,
  onHotkey,
  onCapturing,
  opacity,
  onOpacity,
  pinned,
  onUnpinAll,
  presets,
  nextPresetName,
  onSavePreset,
  onApplyPreset,
  onDeletePreset,
  onChanges,
  updates,
  onPrivacy,
}: SettingsViewProps) {
  const platform = usePlatform();
  const transparency = Math.round((1 - opacity) * 100);
  const checking = updates.status.kind === 'checking' || updates.status.kind === 'installing';

  return (
    <div className="settings" role="group" aria-label="Настройки">
      <button className="back" type="button" onClick={onBack}>
        <BackIcon />
        <span>{backLabel}</span>
      </button>
      <h2 className="art__title">Настройки</h2>

      <Block title="Сервер и организация">
        <Row label="Сервер" value={pack.server.name}>
          <button className="settings__button" type="button" aria-label="Сменить сервер" onClick={onServer}>
            Сменить
          </button>
        </Row>
        <Row label="Организация" value={organization?.name ?? 'не выбрана'}>
          <button className="settings__button" type="button" onClick={onOrganization}>
            Сменить
          </button>
        </Row>
        <p className="set__hint">Законы и устав вашей организации идут первыми в поиске.</p>
      </Block>

      <Block title="Горячая клавиша">
        <HotkeyField hotkey={hotkey} onHotkey={onHotkey} onCapturing={onCapturing} />
      </Block>

      <Block title="Внешний вид">
        <label className="set__row">
          <span className="set__label">Прозрачность фона</span>
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
      </Block>

      <Block title="Настройки игры">
        <p className="set__hint">
          <b>Тип экрана — «Оконный без рамки»</b> (GTA V → «Графика»): поверх полноэкранного режима Windows других окон не
          показывает, и хелпера не будет видно.
        </p>
        <p className="set__hint">
          <b>«Отключение звука при потере фокуса» — «Выкл»</b> (GTA V → «Аудио»): иначе, пока открыт хелпер, игра глушит
          звук.
        </p>
      </Block>

      <Block title="Закреплено поверх игры">
        <Row label={cardsLabel(pinned)}>
          {pinned > 0 && (
            <button className="settings__button" type="button" onClick={onUnpinAll}>
              Открепить всё
            </button>
          )}
        </Row>
        <p className="set__hint">Карточки перетаскиваются за шапку; брошенная на другую встаёт к ней с той стороны, куда её бросили.</p>

        <h4 className="set__sub">Наборы</h4>
        {presets.length > 0 ? (
          <ul className="presets" aria-label="Наборы закреплённых">
            {presets.map((preset) => (
              <li key={preset.id} className="presets__row">
                <span className="presets__name">{preset.name}</span>
                <span className="set__label">{cardsLabel(preset.count)}</span>
                <span className="sp" />
                <button className="settings__button" type="button" aria-label={`Показать набор «${preset.name}»`} onClick={() => onApplyPreset(preset.id)}>
                  Показать
                </button>
                <button className="x" type="button" aria-label={`Удалить набор «${preset.name}»`} title="Удалить набор" onClick={() => onDeletePreset(preset.id)}>
                  <CloseIcon size={14} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="set__hint">Сохраните то, что закреплено сейчас, — «Патруль», «Обыск», — и возвращайте всё одной кнопкой.</p>
        )}
        <PresetForm disabled={pinned === 0} placeholder={nextPresetName} onSave={onSavePreset} />
      </Block>

      <Block title="Законы">
        <Row label="Актуально на" value={formatDate(pack.version)} />
        <button className="settings__button" type="button" onClick={onChanges}>
          Что изменилось в законах
        </button>
      </Block>

      <Block title="Обновления">
        <div className="set__row">
          <button className="settings__button" type="button" disabled={checking} onClick={updates.check}>
            Проверить обновления
          </button>
          <span className="settings__note" role="status">
            {updateNote(updates.status)}
          </span>
        </div>
        <label className="set__row settings__check">
          <input type="checkbox" checked={updates.auto} onChange={(e) => updates.setAuto(e.target.checked)} />
          <span>Проверять обновления автоматически</span>
        </label>
      </Block>

      <Block title="О программе">
        <div className="set__row settings__about">
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
        <div className="set__row set__links">
          <button className="link" type="button" onClick={onPrivacy}>
            Политика конфиденциальности
          </button>
          <span className="sp" />
          <button className="link" type="button" onClick={onEditProfile}>
            Настроить заново
          </button>
        </div>
      </Block>
    </div>
  );
}
