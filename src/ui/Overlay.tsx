import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { searchArticles, type SearchHit, type ServerPack } from '../core';
import { usePlatform } from '../platform/PlatformContext';
import { ArticleView } from './ArticleView';
import { CloseIcon, MenuIcon, SearchIcon, SettingsIcon } from './icons';
import { ResultRow } from './ResultRow';

function resultCount(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} результат`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} результата`;
  return `${n} результатов`;
}

/** Stable key of a hit: an article, or one part of it. */
const hitKey = (hit: SearchHit) => `${hit.article.id}#${hit.part?.number ?? ''}`;

export function Overlay({ pack }: { pack: ServerPack }) {
  const platform = usePlatform();
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const hits = useMemo(() => searchArticles(pack, query), [pack, query]);
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

  // The search field takes focus on first render and every time the overlay is shown again.
  useEffect(() => {
    searchRef.current?.focus();
    return platform.onOverlayShown(() => searchRef.current?.focus());
  }, [platform]);

  return (
    <div className="overlay glass">
      <div className="overlay__head">
        <button className="icon-btn" type="button" aria-label="Все документы" title="Все документы">
          <MenuIcon />
        </button>
        <span className="brand">РО Хелпер</span>
        <span className="sp" />
        <span className="chip">{pack.server.name}</span>
        <button className="icon-btn" type="button" aria-label="Настройки" title="Настройки">
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
          <ArticleView article={open.article} document={open.document} focusPart={open.part} onBack={() => setOpenKey(null)} />
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
                    <ResultRow hit={hit} selected={i === selected} onOpen={() => setOpenKey(hitKey(hit))} />
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
