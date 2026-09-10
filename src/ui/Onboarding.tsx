import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { ServerPack } from '../core';
import { usePlatform } from '../platform/PlatformContext';
import { ChevronLeftIcon, ChevronRightIcon, WarnIcon } from './icons';
import { SERVERS, captureHotkey, formatHotkey, hasModifier, hotkeyKeys, type Profile } from './profile';
import { ResizeEdges } from './ResizeEdges';

const STEPS = 4;

/**
 * First launch (and «Изменить» in the settings): server → organisation → hotkey → screen-mode hint.
 * In settings mode the last button saves, and there is a way out without saving.
 */
export function Onboarding({
  pack,
  initial,
  mode,
  onDone,
  onCancel,
  onCapturing,
}: {
  pack: ServerPack;
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
                  onClick={() => setDraft((d) => ({ ...d, server: choice.id }))}
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
            <div className="ob__orgs" role="radiogroup" aria-label="Организация">
              {pack.organizations.map((org) => (
                <button
                  key={org.id}
                  type="button"
                  role="radio"
                  aria-checked={draft.organization === org.id}
                  className={draft.organization === org.id ? 'ob__org ob__org--on' : 'ob__org'}
                  onClick={() => setDraft((d) => ({ ...d, organization: org.id }))}
                >
                  {org.name}
                </button>
              ))}
            </div>
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
          </>
        )}

        {step === 4 && (
          <>
            <h2 className="ob__title">Режим экрана GTA</h2>
            <p className="ob__sub">
              Оверлей виден поверх игры только в режиме «Оконный без рамки». Поверх полноэкранного режима Windows другие окна не показывает.
            </p>
            <div className="ob__setting" aria-hidden="true">
              <span>Тип экрана</span>
              <span className="sp" />
              <ChevronLeftIcon />
              <span className="ob__setting-value">Оконный без рамки</span>
              <ChevronRightIcon />
            </div>
            <p className="ob__hint">Где это: настройки GTA V → «Графика».</p>
            <p className="ob__summary">
              {server?.name} · {organization?.name} · {formatHotkey(draft.hotkey)}. Всё это можно поменять в настройках.
            </p>
          </>
        )}
      </div>

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
