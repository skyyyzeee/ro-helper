import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import type { Organization, ServerPack } from '../core';
import { usePlatform } from '../platform/PlatformContext';
import { USAGE_SHARE_KEY } from '../account/usage';
import { AccountCard, AccountSection } from './ProfileView';
import { ACCENT_HUES, THEMES, organizationHue, type AppearanceControl } from './appearance';
import { AI_SERVER, APP_VERSION, AUTHOR, LINKS } from './about';
import { AI_KEY_SETTING, AI_KEY_URL, AI_PROVIDER_SETTING, AI_SERVER_SETTING, type AiProvider } from './ai';
import { BookIcon, CloseIcon, DiscordIcon, GitHubIcon, InfoIcon, KeyboardIcon, PaletteIcon, PinIcon, SparkIcon, TuneIcon, WarnIcon } from './icons';
import { formatDate } from './lawBits';
import { DEFAULT_VOICE_HOTKEY, MAX_OPACITY, MIN_OPACITY } from './overlaySettings';
import { captureHotkey, hasModifier, hotkeyKeys } from './profile';
import type { Laws, LawsStatus } from './laws';
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

/** What a check for newer laws found, beside its button. */
function lawsNote(status: LawsStatus): string | null {
  switch (status.kind) {
    case 'checking':
      return 'Проверяю…';
    case 'latest':
      return 'Законы актуальны';
    case 'offline':
      return 'Нет связи с GitHub';
    case 'updated':
      return 'Загружены новые законы';
    default:
      return null;
  }
}

/** The parts of the settings, in the column on their left: the account on top, then these. */
export type SettingsSection = 'account' | 'main' | 'ai' | 'look' | 'pinned' | 'laws' | 'keys' | 'about';
const SECTIONS: { id: SettingsSection; label: string; icon: ReactNode }[] = [
  { id: 'main', label: 'Основное', icon: <TuneIcon /> },
  { id: 'ai', label: 'ИИ', icon: <SparkIcon size={18} /> },
  { id: 'look', label: 'Внешний вид', icon: <PaletteIcon /> },
  { id: 'pinned', label: 'Закреплённые', icon: <PinIcon /> },
  { id: 'laws', label: 'Законы и обновления', icon: <BookIcon /> },
  { id: 'keys', label: 'Клавиши', icon: <KeyboardIcon /> },
  { id: 'about', label: 'О программе', icon: <InfoIcon /> },
];
const sectionId = (id: SettingsSection) => `settings-${id}`;

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
function HotkeyField({
  hotkey,
  onHotkey,
  onCapturing,
  label = 'Открыть и скрыть оверлей',
}: {
  hotkey: string;
  onHotkey: (accelerator: string) => void;
  onCapturing: (capturing: boolean) => void;
  label?: string;
}) {
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
        <span className="set__label">{label}</span>
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

/** The theme, and the accent: the organisation's, or one of a few hues. */
function AppearancePicker({ appearance, organization }: { appearance: AppearanceControl; organization: string }) {
  const { theme, accent, setTheme, setAccent } = appearance;
  return (
    <>
      <div className="themes" role="radiogroup" aria-label="Тема">
        {THEMES.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={theme === option.id}
            className={theme === option.id ? 'theme theme--on' : 'theme'}
            onClick={() => setTheme(option.id)}
          >
            <span className={`theme__swatch theme__swatch--${option.id}`} />
            {option.label}
          </button>
        ))}
      </div>
      <div className="set__row">
        <span className="set__label">Акцент</span>
      </div>
      <div className="swatches" role="radiogroup" aria-label="Акцент">
        <button
          type="button"
          role="radio"
          aria-checked={accent === 'organization'}
          aria-label="Как у организации"
          title="Как у организации"
          className={accent === 'organization' ? 'swatch swatch--organization swatch--on' : 'swatch swatch--organization'}
          style={{ '--swatch-hue': organizationHue(organization) } as CSSProperties}
          onClick={() => setAccent('organization')}
        />
        {ACCENT_HUES.map((hue) => (
          <button
            key={hue}
            type="button"
            role="radio"
            aria-checked={accent === hue}
            aria-label={`Оттенок ${hue}`}
            className={accent === hue ? 'swatch swatch--on' : 'swatch'}
            style={{ '--swatch-hue': hue } as CSSProperties}
            onClick={() => setAccent(hue)}
          />
        ))}
      </div>
    </>
  );
}

/** The player's Gemini key for the AI analysis: kept in the settings file on this computer, shown only as a mask. */
function AiKeyField() {
  const platform = usePlatform();
  const [saved, setSaved] = useState<boolean | null>(null);
  const [key, setKey] = useState('');
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    void platform.readSetting<string>(AI_KEY_SETTING).then((value) => setSaved(!!value?.trim()));
  }, [platform]);
  const save = (event: FormEvent) => {
    event.preventDefault();
    const value = key.trim();
    if (!value) return;
    void platform.writeSetting(AI_KEY_SETTING, value).then(() => {
      setSaved(true);
      setKey('');
      setNote('Ключ сохранён');
    });
  };
  const remove = () =>
    void platform.writeSetting(AI_KEY_SETTING, '').then(() => {
      setSaved(false);
      setNote('Ключ удалён');
    });
  return (
    <>
      <Row label="Ключ Gemini" value={saved === null ? '…' : saved ? 'сохранён' : 'не задан'}>
        {saved && (
          <button className="settings__button" type="button" onClick={remove}>
            Удалить
          </button>
        )}
      </Row>
      <form className="set__row presets__form" onSubmit={save}>
        <input
          className="presets__input"
          type="password"
          aria-label="Ключ Gemini"
          placeholder={saved ? 'Вставьте новый ключ, чтобы заменить' : 'Вставьте ключ: AIza…'}
          autoComplete="off"
          spellCheck={false}
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
            setNote(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && key) {
              e.stopPropagation();
              setKey('');
            }
          }}
        />
        <button className="settings__button" type="submit" disabled={!key.trim()}>
          Сохранить
        </button>
      </form>
      {note && (
        <span className="settings__note" role="status">
          {note}
        </span>
      )}
      <p className="set__hint">
        Ключ бесплатный, у каждого игрока свой. Он хранится только на этом компьютере.{' '}
        <button className="link" type="button" onClick={() => void platform.openExternal(AI_KEY_URL)}>
          Получить ключ на aistudio.google.com
        </button>
      </p>
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

function Switch({ label, hint, on, disabled, onChange }: { label: string; hint?: string; on: boolean; disabled?: boolean; onChange: (on: boolean) => void }) {
  return (
    <>
      <div className="set__row">
        <span className="set__label set__label--strong">{label}</span>
        <span className="sp" />
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={label}
          disabled={disabled}
          className={on ? 'switch switch--on' : 'switch'}
          onClick={() => onChange(!on)}
        >
          <span className="switch__knob" />
        </button>
      </div>
      {hint && <p className="set__hint">{hint}</p>}
    </>
  );
}

/** «Запускать вместе с Windows»: asked of Windows itself, so it shows what really happens at logon. */
/** Where the AI's answers come from, when an AI server is known; without one, the player's own Gemini key. */
function AiProviderField() {
  const platform = usePlatform();
  const [server, setServer] = useState<string | null>(null);
  const [provider, setProvider] = useState<AiProvider>('server');
  useEffect(() => {
    void platform.readSetting<string>(AI_SERVER_SETTING).then((saved) => setServer(saved?.trim() || AI_SERVER));
    void platform.readSetting<AiProvider>(AI_PROVIDER_SETTING).then((saved) => setProvider(saved ?? 'server'));
  }, [platform]);
  const choose = (next: AiProvider) => {
    setProvider(next);
    void platform.writeSetting(AI_PROVIDER_SETTING, next);
  };
  if (server === null) return null;
  if (!server) return <AiKeyField />;
  return (
    <>
      <div className="ai-provider" role="radiogroup" aria-label="Откуда ответы ИИ">
        {(
          [
            ['server', 'Сервер ИИ'],
            ['gemini', 'Свой ключ Gemini'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" role="radio" aria-checked={provider === id} className={provider === id ? 'settings__button ai-provider__on' : 'settings__button'} onClick={() => choose(id)}>
            {label}
          </button>
        ))}
      </div>
      {provider === 'gemini' ? (
        <>
          <p className="set__hint">Gemini не работает из России. Если он у вас работает — ключ бесплатный, у каждого игрока свой.</p>
          <AiKeyField />
        </>
      ) : (
        <p className="set__hint">Ничего настраивать не нужно: ответы идут через сервер ИИ, с дневным лимитом вопросов на каждый компьютер.</p>
      )}
    </>
  );
}

export interface SettingsViewProps {
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
  /** The push-to-talk key for a question over the game; empty when off. */
  voiceHotkey: string;
  onVoiceHotkey: (accelerator: string) => void;
  opacity: number;
  onOpacity: (value: number) => void;
  /** The theme and the accent; without it (a bare overlay in tests) the choice is not shown. */
  appearance?: AppearanceControl;
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
  /** Checking GitHub for newer laws, without a new version of the app. */
  laws?: Pick<Laws, 'status' | 'check'>;
  /** Opens what is new in every version. */
  onHistory: () => void;
  /** A part to bring into view — the account from the side column's profile, what is pinned from its pin — asked for at `at`. */
  focus?: { section: SettingsSection; at: number };
}

/** The settings screen: what the helper works with, how it looks, the laws, updates and the app itself. */
export function SettingsView({
  pack,
  organization,
  onServer,
  onOrganization,
  onEditProfile,
  hotkey,
  onHotkey,
  onCapturing,
  voiceHotkey,
  onVoiceHotkey,
  opacity,
  onOpacity,
  appearance,
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
  laws,
  onHistory,
  focus,
}: SettingsViewProps) {
  const platform = usePlatform();
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<SettingsSection>(focus?.section ?? 'account');
  /** While a part picked in the column scrolls into view, the scrolling doesn't move the mark. */
  const picked = useRef(0);

  const show = (section: SettingsSection, smooth: boolean) => {
    setActive(section);
    picked.current = Date.now();
    document.getElementById(sectionId(section))?.scrollIntoView?.({ block: 'start', behavior: smooth ? 'smooth' : 'auto' });
  };
  useEffect(() => {
    if (focus) show(focus.section, false);
    // Only when asked again, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.at]);

  // The column marks the part being read: the last one whose top has come up to the top.
  useEffect(() => {
    const scroller = root.current?.closest('.overlay__content');
    if (!scroller) return;
    const onScroll = () => {
      if (Date.now() - picked.current < 800) return;
      const top = scroller.getBoundingClientRect().top + 48;
      let current: SettingsSection = 'account';
      for (const id of SECTIONS.map((section) => section.id)) {
        const element = document.getElementById(sectionId(id));
        if (element && element.getBoundingClientRect().top <= top) current = id;
      }
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) current = SECTIONS[SECTIONS.length - 1].id;
      setActive(current);
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  }, []);
  // The author's anonymous counts: on unless turned off.
  const [share, setShare] = useState(true);
  useEffect(() => {
    void platform.readSetting<boolean>(USAGE_SHARE_KEY).then((saved) => setShare(saved !== false));
  }, [platform]);
  const transparency = Math.round((1 - opacity) * 100);
  const checking = updates.status.kind === 'checking' || updates.status.kind === 'installing';

  return (
    <div className="settings" role="group" aria-label="Настройки" ref={root}>
      <nav className="setnav" aria-label="Разделы настроек">
        <AccountCard current={active === 'account'} onSelect={() => show('account', true)} />
        {SECTIONS.map((section) => (
          <button
            key={section.id}
            className="setnav__item"
            type="button"
            aria-current={active === section.id ? 'true' : undefined}
            onClick={() => show(section.id, true)}
          >
            {section.icon}
            <span>{section.label}</span>
          </button>
        ))}
      </nav>

      <div className="settings__body">
      <div className="settings__part" id={sectionId('account')}>
        <Block title="Аккаунт">
          <AccountSection pack={pack} organization={organization} />
        </Block>
      </div>

      <div className="settings__part" id={sectionId('main')}>
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

      <Block title="Настройки игры">
        <p className="set__hint">
          <b>Тип экрана — «Оконный без рамки»</b> (GTA V → «Графика»): поверх полноэкранного режима Windows других окон не
          показывает, и ассистента не будет видно.
        </p>
        <p className="set__hint">
          <b>«Отключение звука при потере фокуса» — «Выкл»</b> (GTA V → «Аудио»): иначе, пока открыт ассистент, игра глушит
          звук.
        </p>
      </Block>
      </div>

      <div className="settings__part" id={sectionId('ai')}>
      <Block title="ИИ-разбор">
        <AiProviderField />
      </Block>

      <Block title="Вопрос голосом поверх игры">
        <Switch
          label="Спрашивать, не открывая окно"
          hint="Держите клавишу и говорите, отпустите — ответ ИИ появится карточкой поверх игры. Окно ассистента не открывается, вопрос попадает в историю."
          on={!!voiceHotkey}
          onChange={(on) => onVoiceHotkey(on ? DEFAULT_VOICE_HOTKEY : '')}
        />
        {voiceHotkey && <HotkeyField label="Держать, чтобы спросить" hotkey={voiceHotkey} onHotkey={onVoiceHotkey} onCapturing={onCapturing} />}
        {voiceHotkey && voiceHotkey === hotkey && (
          <div className="warn" role="alert">
            <WarnIcon />
            <span>Это та же клавиша, что открывает ассистент, — выберите другую, иначе вопрос голосом не сработает.</span>
          </div>
        )}
      </Block>
      </div>

      <div className="settings__part" id={sectionId('look')}>
      <Block title="Внешний вид">
        {appearance && <AppearancePicker appearance={appearance} organization={organization?.id ?? 'none'} />}
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
      </div>

      <div className="settings__part" id={sectionId('pinned')}>
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
      </div>

      <div className="settings__part" id={sectionId('laws')}>
      <Block title="Законы">
        <Row label="Актуально на" value={formatDate(pack.version)} />
        <button className="settings__button" type="button" onClick={onChanges}>
          Что изменилось в законах
        </button>
        {laws && (
          <div className="set__row">
            <button className="settings__button" type="button" disabled={laws.status.kind === 'checking'} onClick={laws.check}>
              Проверить законы
            </button>
            <span className="settings__note" role="status" aria-label="Проверка законов">
              {lawsNote(laws.status)}
            </span>
          </div>
        )}
        <p className="set__hint">Новые законы приходят с GitHub сами, без обновления программы.</p>
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
      </div>

      <div className="settings__part" id={sectionId('keys')}>
      <Block title="Горячая клавиша">
        <HotkeyField hotkey={hotkey} onHotkey={onHotkey} onCapturing={onCapturing} />
      </Block>
      </div>

      <div className="settings__part" id={sectionId('about')}>
      <Block title="О программе">
        <div className="set__row settings__about">
          <span>
            Кремлёвский Ассистент {APP_VERSION} · автор {AUTHOR}
          </span>
          <span className="sp" />
          <button className="icon-btn icon-btn--sm" type="button" aria-label="GitHub" title="GitHub" onClick={() => void platform.openExternal(LINKS.repository)}>
            <GitHubIcon />
          </button>
          <button className="icon-btn icon-btn--sm" type="button" aria-label="Discord" title="Discord" onClick={() => void platform.openExternal(LINKS.discord)}>
            <DiscordIcon />
          </button>
        </div>
        <label className="set__row settings__check">
          <input
            type="checkbox"
            checked={share}
            onChange={(e) => {
              setShare(e.target.checked);
              void platform.writeSetting(USAGE_SHARE_KEY, e.target.checked);
            }}
          />
          <span>Отправлять автору обезличенную статистику</span>
        </label>
        <p className="set__hint">
          Сколько за день открыли статей, сделали поисков и расчётов на каждом сервере — без аккаунта, компьютера и самих статей.
          Помогает понять, чем пользуются.
        </p>
        <p className="set__hint">Иконки — Material Symbols от Google (лицензия Apache 2.0), значки серверов — с вики Russia Online.</p>
        <div className="set__row set__links">
          <button className="link" type="button" onClick={onPrivacy}>
            Политика конфиденциальности
          </button>
          <button className="link" type="button" onClick={onHistory}>
            История версий
          </button>
          <span className="sp" />
          <button className="link" type="button" onClick={onEditProfile}>
            Настроить заново
          </button>
        </div>
      </Block>
      </div>
      </div>
    </div>
  );
}
