import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { packFor } from '../data';
import { usePlatform } from '../platform/PlatformContext';
import { WarnIcon } from './icons';
import { OrganizationChoice } from './OrganizationChoice';
import { SERVERS, captureHotkey, formatHotkey, hasModifier, hotkeyKeys, type Profile } from './profile';
import { ResizeEdges } from './ResizeEdges';

const STEPS = 3;

/**
 * First launch (and «Изменить» in the settings): server → organisation → hotkey. At the first launch
 * the screen-mode notice comes over the organisation step, where the game is still fresh in mind.
 * In settings mode the last button saves, and there is a way out without saving.
 */
/** Over the first launch: the game must run in borderless windowed mode, or the overlay is not seen. */
function WindowModeNotice({ onClose }: { onClose: () => void }) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => button.current?.focus(), []);
  return (
    <div className="notice" role="alertdialog" aria-label="Режим экрана GTA">
      <div className="notice__card">
        <div className="notice__head">
          <WarnIcon size={20} />
          <h3 className="notice__title">Включите «Оконный без рамки»</h3>
        </div>
        <p className="notice__text">
          Хелпер виден поверх игры только в этом режиме: поверх полноэкранного Windows других окон не показывает.
        </p>
        <p className="notice__where">Настройки GTA V → «Графика» → «Тип экрана» → «Оконный без рамки».</p>
        <button ref={button} className="btn btn--primary notice__ok" type="button" onClick={onClose}>
          Понятно
        </button>
      </div>
    </div>
  );
}

export function Onboarding({
  initial,
  mode,
  onDone,
  onCancel,
  onCapturing,
}: {
  initial: Profile;
  mode: 'first' | 'settings';
  onDone: (profile: Profile) => void;
  onCancel?: () => void;
  /** While a hotkey is being recorded the current one must be released, or Windows swallows the keys. */
  onCapturing: (capturing: boolean) => void;
}) {
  const platform = usePlatform();
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState(initial);
  const [listening, setListening] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const [notice, setNotice] = useState(false);

  // The laws — and so the organisations to choose from — are the ones of the server in the draft.
  const pack = packFor(draft.server);
  const organization = pack.organizations.find((o) => o.id === draft.organization);
  const server = SERVERS.find((s) => s.id === draft.server);

  useEffect(() => onCapturing(listening), [listening, onCapturing]);
  useEffect(() => () => onCapturing(false), [onCapturing]);

  // Esc leaves the settings without saving (but first stops recording a hotkey).
  useEffect(() => {
    if (mode !== 'settings' || !onCancel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !listening) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, onCancel, listening]);

  const record = (e: ReactKeyboardEvent) => {
    if (!listening) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') {
      setListening(false);
      return;
    }
    const result = captureHotkey(e);
    if (result.kind === 'waiting') return;
    if (result.kind === 'unsupported') {
      setUnsupported(true);
      return;
    }
    setUnsupported(false);
    setDraft((d) => ({ ...d, hotkey: result.accelerator }));
    setListening(false);
  };

  const next = () => {
    setListening(false);
    // Only at the first launch: what the game must be set to, once, before the last step.
    if (step === 2 && mode === 'first') {
      setNotice(true);
      return;
    }
    if (step < STEPS) setStep(step + 1);
    else onDone(draft);
  };

  return (
    <div className="shell">
      {platform.kind === 'tauri' && <ResizeEdges />}
      <div className="overlay glass onboarding">
      <div className="ob__head" data-tauri-drag-region>
        <span className="brand" data-tauri-drag-region>
          {mode === 'first' ? 'РО Хелпер' : 'Настройки'}
        </span>
        <span className="sp" data-tauri-drag-region />
        <span className="muted" data-tauri-drag-region>
          Шаг {step} из {STEPS}
        </span>
      </div>
      <div className="ob__progress" aria-hidden="true">
        {Array.from({ length: STEPS }, (_, i) => (
          <span key={i} className={i < step ? 'on' : undefined} />
        ))}
      </div>

      <div className="ob__body">
        {step === 1 && (
          <>
            <h2 className="ob__title">Выберите сервер</h2>
            <p className="ob__sub">Законы и правила берутся из законодательной базы выбранного сервера.</p>
            <div className="ob__options" role="radiogroup" aria-label="Сервер">
              {SERVERS.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  role="radio"
                  aria-checked={draft.server === choice.id}
                  disabled={choice.status !== 'active'}
                  className={draft.server === choice.id ? 'ob__option ob__option--on' : 'ob__option'}
                  onClick={() =>
                    setDraft((d) => {
                      // Another server has its own organisations: one it does not have goes back to «Без организации».
                      const organizations = packFor(choice.id).organizations;
                      const keep = organizations.some((o) => o.id === d.organization);
                      return { ...d, server: choice.id, organization: keep ? d.organization : 'none' };
                    })
                  }
                >
                  <span className="ob__option-name">{choice.name}</span>
                  <span className="sp" />
                  {choice.status === 'soon' && <span className="ob__option-note">{['скоро', choice.note].filter(Boolean).join(' · ')}</span>}
                  <span className="ob__radio" />
                </button>
              ))}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="ob__title">Ваша организация</h2>
            <p className="ob__sub">Её законы и устав будут первыми в поиске. Документы остальных организаций тоже доступны.</p>
            <OrganizationChoice pack={pack} value={draft.organization} onPick={(id) => setDraft((d) => ({ ...d, organization: id }))} />
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="ob__title">Горячая клавиша</h2>
            <p className="ob__sub">Открывает и скрывает оверлей прямо в игре.</p>
            <button
              type="button"
              className={listening ? 'ob__hotkey ob__hotkey--listen' : 'ob__hotkey'}
              aria-label={`Горячая клавиша: ${listening ? 'нажмите сочетание' : formatHotkey(draft.hotkey)}`}
              onClick={() => {
                setUnsupported(false);
                setListening(true);
              }}
              onBlur={() => setListening(false)}
              onKeyDown={record}
            >
              {listening ? (
                <span className="muted">Нажмите сочетание клавиш…</span>
              ) : (
                hotkeyKeys(draft.hotkey).map((key) => (
                  <span key={key} className="ob__key">
                    {key}
                  </span>
                ))
              )}
            </button>
            <p className="ob__hint">Нажмите на поле, затем нужное сочетание. Esc — отмена.</p>
            {unsupported && <p className="ob__hint">Эту клавишу назначить нельзя: подойдут буквы, цифры, F1–F24, пробел.</p>}
            {!hasModifier(draft.hotkey) && (
              <div className="warn" role="alert">
                <WarnIcon />
                <span>Без Ctrl, Alt или Shift клавиша может пересечься с управлением в игре.</span>
              </div>
            )}
            <p className="ob__summary">
              {server?.name} · {organization?.name} · {formatHotkey(draft.hotkey)}. Всё это можно поменять в настройках.
            </p>
          </>
        )}

      </div>

      {notice && <WindowModeNotice onClose={() => { setNotice(false); setStep(3); }} />}

      <div className="ob__foot">
        {step > 1 && (
          <button className="btn btn--ghost" type="button" onClick={() => setStep(step - 1)}>
            Назад
          </button>
        )}
        {mode === 'settings' && onCancel && (
          <button className="btn btn--ghost" type="button" onClick={onCancel}>
            Отмена
          </button>
        )}
        <span className="sp" />
        <button className="btn btn--primary" type="button" onClick={next}>
          {step < STEPS ? 'Далее' : mode === 'settings' ? 'Сохранить' : 'Готово'}
        </button>
      </div>
      </div>
    </div>
  );
}
