import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { searchArticles, type SearchHit, type ServerPack } from '../core';
import { usePlatform } from '../platform/PlatformContext';
import { ArticleView } from './ArticleView';
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

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (open || !hits.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((i) => Math.max(i - 1, 0));
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
    <div className="overlay glass">
      {platform.kind === 'tauri' && <ResizeEdges />}
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
                    <ResultRow hit={hit} selected={i === selected} onOpen={() => openHit(hit)} />
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
  );
}
