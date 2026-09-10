import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  calculateDetention,
  leadPart,
  searchArticles,
  type Charge,
  type ChargeItem,
  type Mode,
  type Offender,
  type SearchHit,
  type ServerPack,
} from '../core';
import { usePlatform } from '../platform/PlatformContext';
import { ArticleView } from './ArticleView';
import { CalculatorPanel, type ChargeFields, type ChargePatch, type CopyState } from './CalculatorPanel';
import { CloseIcon, MenuIcon, SearchIcon, SettingsIcon } from './icons';
import { DEFAULT_OPACITY, OPACITY_KEY, applyOpacity, clampOpacity } from './overlaySettings';
import type { Profile } from './profile';
import { ResizeEdges } from './ResizeEdges';
import { ResultRow } from './ResultRow';
import { SettingsPanel } from './SettingsPanel';

function resultCount(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} результат`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} результата`;
  return `${n} результатов`;
}

/** Stable key of a hit: an article, or one part of it. */
const hitKey = (hit: SearchHit) => `${hit.article.id}#${hit.part?.number ?? ''}`;

/** Width of the calculator panel plus the gap to the overlay, in CSS pixels. */
const CALCULATOR_WIDTH = 400 + 12;

/** A charge in the calculator, with what the officer typed for it. */
interface Entry extends ChargeFields, Omit<ChargePatch, keyof ChargeFields> {
  key: string;
  hit: SearchHit;
}

/** «15 000» → 15000; an empty field is no number. */
function typedNumber(text: string): number | undefined {
  const digits = text.replace(/\D/g, '');
  return digits ? Number(digits) : undefined;
}

/** Whether the user has selected some text, which Ctrl+C should copy instead of the charges. */
function hasSelectedText(): boolean {
  const active = document.activeElement;
  if ((active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) && active.selectionStart !== active.selectionEnd) return true;
  return !!window.getSelection()?.toString();
}

export function Overlay({ pack, profile, onEditProfile }: { pack: ServerPack; profile: Profile; onEditProfile: () => void }) {
  const platform = usePlatform();
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [opacity, setOpacity] = useState(DEFAULT_OPACITY);
  const organization = pack.organizations.find((o) => o.id === profile.organization);
  const boostDocuments = organization?.documents;
  const hits = useMemo(() => searchArticles(pack, query, { boostDocuments }), [pack, query, boostDocuments]);
  const summary = [pack.server.name, organization && organization.id !== 'none' ? organization.name : null].filter(Boolean).join(' · ');
  const open = openKey ? hits.find((hit) => hitKey(hit) === openKey) : undefined;

  // Calculator: charges of both codes, the mode and the offender for the whole detention, the fine typed in.
  const [charges, setCharges] = useState<Entry[]>([]);
  const [mode, setMode] = useState<Mode>('custody');
  const [offender, setOffender] = useState<Offender>('citizen');
  const [fineInput, setFineInput] = useState('');
  const [side, setSide] = useState<'left' | 'right'>('left');
  const calculable = [pack.calculator.criminalCode, pack.calculator.administrative.code];
  const addable = (hit: SearchHit) => calculable.includes(hit.document.id) && !!(hit.part ?? leadPart(hit.article))?.punishment;
  const toggleCharge = (hit: SearchHit) => {
    const key = hitKey(hit);
    setCharges((list) =>
      list.some((c) => c.key === key) ? list.filter((c) => c.key !== key) : [...list, { key, hit, stage: 'done', amount: '', days: '', unpaid: '' }],
    );
    searchRef.current?.focus();
  };
  const items = useMemo(
    () =>
      charges.map(
        (c): Charge => ({
          article: c.hit.article,
          document: c.hit.document,
          part: c.hit.part ?? leadPart(c.hit.article)!,
          stage: c.stage ?? 'done',
          wantedLevel: c.wantedLevel,
          choice: c.choice,
          amount: typedNumber(c.amount),
          days: typedNumber(c.days),
          unpaid: typedNumber(c.unpaid),
        }),
      ),
    [charges],
  );
  const result = useMemo(() => calculateDetention(items, { mode, offender }, pack.calculator), [items, mode, offender, pack.calculator]);
  /** The calculator's entry behind a charge of the result. */
  const entryOf = (item: ChargeItem) => charges[items.findIndex((c) => c === item)];
  const updateCharge = (item: ChargeItem, patch: ChargePatch) => {
    const key = entryOf(item)?.key;
    setCharges((list) => list.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  };
  const calculatorOpen = charges.length > 0;

  // An emptied calculator is a new detention: nothing carries over from the last one.
  useEffect(() => {
    if (calculatorOpen) return;
    setMode('custody');
    setOffender('citizen');
    setFineInput('');
  }, [calculatorOpen]);

  const [copyState, setCopyState] = useState<CopyState>('idle');
  const copyTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(copyTimer.current), []);
  const copyCharges = () => {
    if (!result.charge) return;
    const show = (state: CopyState) => {
      setCopyState(state);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopyState('idle'), 1500);
    };
    platform.writeClipboard(result.charge).then(
      () => show('copied'),
      () => show('failed'),
    );
  };
  /** Ctrl+C copies the charges, unless there is text selected to copy. Says whether it did. */
  const copyShortcut = useRef<() => boolean>(() => false);
  copyShortcut.current = () => {
    if (!result.charge || hasSelectedText()) return false;
    copyCharges();
    return true;
  };

  // The window grows towards the centre of the screen for the panel, and shrinks back when it closes.
  useEffect(() => {
    if (calculatorOpen) void platform.extendWindow(CALCULATOR_WIDTH).then(setSide);
    else void platform.retractWindow();
  }, [calculatorOpen, platform]);
  useEffect(() => () => void platform.retractWindow(), [platform]);

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (open || !hits.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      // Enter puts a punished article into the calculator; an article without a punishment opens instead.
      e.preventDefault();
      const hit = hits[selected];
      if (!hit) return;
      if (addable(hit)) toggleCharge(hit);
      else openHit(hit);
    }
  };

  /** Esc steps back one layer at a time: settings → article → search text → hide the overlay. */
  const stepBack = useRef<() => void>(() => {});
  stepBack.current = () => {
    if (settingsOpen) setSettingsOpen(false);
    else if (open) setOpenKey(null);
    else if (query) {
      setQuery('');
      setSelected(0);
    } else void platform.hideOverlay();
    searchRef.current?.focus();
  };

  // On the window, not an element: a clicked result disappears and takes the focus with it.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      // By the physical key, or by the letter in either layout when the key is unknown.
      const isC = e.code === 'KeyC' || (!e.code && (e.key === 'c' || e.key === 'с'));
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && isC) {
        if (copyShortcut.current()) e.preventDefault();
        return;
      }
      if (e.key !== 'Escape') return;
      e.preventDefault();
      stepBack.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openHit = (hit: SearchHit) => {
    setOpenKey(hitKey(hit));
    searchRef.current?.focus();
  };

  // The search field takes focus on first render and every time the overlay is shown again.
  useEffect(() => {
    searchRef.current?.focus();
    return platform.onOverlayShown(() => searchRef.current?.focus());
  }, [platform]);

  useEffect(() => {
    void platform.readSetting<number>(OPACITY_KEY).then((saved) => {
      const value = clampOpacity(saved ?? DEFAULT_OPACITY);
      setOpacity(value);
      applyOpacity(value);
    });
  }, [platform]);

  const changeOpacity = (value: number) => {
    const clamped = clampOpacity(value);
    setOpacity(clamped);
    applyOpacity(clamped);
    void platform.writeSetting(OPACITY_KEY, clamped);
  };

  return (
    <div className={`shell shell--${side}`}>
      {platform.kind === 'tauri' && <ResizeEdges />}
      {calculatorOpen && (
        <CalculatorPanel
          result={result}
          onMode={setMode}
          onOffender={setOffender}
          fieldsOf={(item) => entryOf(item) ?? { amount: '', days: '', unpaid: '' }}
          onUpdate={updateCharge}
          onRemove={(item) => {
            const key = entryOf(item)?.key;
            setCharges((list) => list.filter((c) => c.key !== key));
          }}
          onClear={() => setCharges([])}
          fineInput={fineInput}
          onFineInput={setFineInput}
          onCopy={copyCharges}
          copyState={copyState}
        />
      )}
    <div className="overlay glass">
      <div className="overlay__head" data-tauri-drag-region>
        <button className="icon-btn" type="button" aria-label="Все документы" title="Все документы">
          <MenuIcon />
        </button>
        <span className="brand" data-tauri-drag-region>
          РО Хелпер
        </span>
        <span className="sp" data-tauri-drag-region />
        <span className="chip" data-tauri-drag-region>
          {summary}
        </span>
        <button
          className={settingsOpen ? 'icon-btn icon-btn--on' : 'icon-btn'}
          type="button"
          aria-label="Настройки"
          aria-expanded={settingsOpen}
          title="Настройки"
          onClick={() => setSettingsOpen((v) => !v)}
        >
          <SettingsIcon />
        </button>
        <button
          className="icon-btn"
          type="button"
          aria-label="Скрыть оверлей"
          title="Скрыть оверлей"
          onClick={() => void platform.hideOverlay()}
        >
          <CloseIcon />
        </button>
      </div>

      {settingsOpen && (
        <SettingsPanel summary={summary} hotkey={profile.hotkey} opacity={opacity} onOpacity={changeOpacity} onEditProfile={onEditProfile} />
      )}

      <div className="search">
        <SearchIcon />
        <input
          ref={searchRef}
          className="search__input"
          type="search"
          aria-label="Поиск по законам"
          placeholder="Номер или слова: 65, коап 8.6, кража"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpenKey(null);
            setSelected(0);
          }}
          onKeyDown={onSearchKey}
        />
        <span className="kbd">Esc</span>
      </div>

      <div className="overlay__content">
        {open ? (
          <ArticleView
            article={open.article}
            document={open.document}
            focusPart={open.part}
            onBack={() => {
              setOpenKey(null);
              searchRef.current?.focus();
            }}
          />
        ) : (
          query.trim() && (
            <>
              <div className="meta">
                <span>{resultCount(hits.length)}</span>
                <span>все документы</span>
              </div>
              <div className="list" role="list" aria-label="Результаты поиска">
                {hits.map((hit, i) => (
                  <div role="listitem" key={hitKey(hit)}>
                    <ResultRow
                      hit={hit}
                      selected={i === selected}
                      onOpen={() => openHit(hit)}
                      calculator={addable(hit) ? { added: charges.some((c) => c.key === hitKey(hit)), onToggle: () => toggleCharge(hit) } : undefined}
                    />
                  </div>
                ))}
              </div>
              {hits.length === 0 && <div className="empty">Ничего не найдено</div>}
            </>
          )
        )}
      </div>

      <div className="overlay__foot">
        <span>
          <b>↑↓</b> выбор
        </span>
        <span>
          <b>Enter</b> в калькулятор
        </span>
        <span>
          <b>→</b> открыть
        </span>
        <span>
          <b>Esc</b> назад
        </span>
      </div>
    </div>
    </div>
  );
}
