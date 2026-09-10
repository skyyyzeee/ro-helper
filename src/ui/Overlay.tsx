import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { calculateCriminal, leadPart, searchArticles, type ChargeItem, type Mode, type SearchHit, type ServerPack, type Stage } from '../core';
import { usePlatform } from '../platform/PlatformContext';
import { ArticleView } from './ArticleView';
import { CalculatorPanel } from './CalculatorPanel';
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

interface Charge {
  key: string;
  hit: SearchHit;
  stage: Stage;
  wantedLevel?: number;
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

  // Calculator: charges from the criminal code, the mode for the whole detention, the fine typed in.
  const [charges, setCharges] = useState<Charge[]>([]);
  const [mode, setMode] = useState<Mode>('custody');
  const [fineInput, setFineInput] = useState('');
  const [side, setSide] = useState<'left' | 'right'>('left');
  const addable = (hit: SearchHit) => hit.document.id === pack.calculator.criminalCode && !!(hit.part ?? leadPart(hit.article))?.punishment;
  const toggleCharge = (hit: SearchHit) => {
    const key = hitKey(hit);
    setCharges((list) => (list.some((c) => c.key === key) ? list.filter((c) => c.key !== key) : [...list, { key, hit, stage: 'done' }]));
    searchRef.current?.focus();
  };
  const updateCharge = (index: number, patch: Partial<Charge>) =>
    setCharges((list) => list.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  const result = useMemo(() => {
    const items: ChargeItem[] = charges.map((c) => ({
      article: c.hit.article,
      document: c.hit.document,
      part: c.hit.part ?? leadPart(c.hit.article)!,
      stage: c.stage,
      wantedLevel: c.wantedLevel,
    }));
    return calculateCriminal(items, mode, pack.calculator);
  }, [charges, mode, pack.calculator]);
  const calculatorOpen = charges.length > 0;

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
          onStage={(index, stage) => updateCharge(index, { stage })}
          onWantedLevel={(index, wantedLevel) => updateCharge(index, { wantedLevel })}
          onRemove={(index) => setCharges((list) => list.filter((_, i) => i !== index))}
          onClear={() => setCharges([])}
          fineInput={fineInput}
          onFineInput={setFineInput}
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
