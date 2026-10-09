import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { articleHeading, explainEmpty, formatPunishment, searchArticles, type SearchHit, type ServerPack } from '../core';
import { loadPack, loadedPack, serverMeta } from '../data';
import type { PinLook, QuickBridge, QuickState } from '../platform/types';
import { applyAppearance, isTheme } from './appearance';
import { BackIcon, CalculatorIcon, CheckIcon, CloseIcon, GripIcon, SearchIcon, SparkIcon } from './icons';
import { isNewer, readPack } from './laws';
import { DocBadge, Stars } from './lawBits';
import { PROFILE_KEY, type Profile } from './profile';
import { NoResults } from './NoResults';
import { ResultRow } from './ResultRow';
import { entryPart, hitKey, useHitLookup } from './saved';

/** How many results the bar shows under the field. */
const SHOWN = 8;
/** The theme and accent of the overlay, as the pinned cards get them. */
const LOOK_KEY = 'pin.look';

type Mode = 'laws' | 'recent' | 'ai';
const MODES: { id: Mode; label: string }[] = [
  { id: 'laws', label: 'Законы' },
  { id: 'recent', label: 'Недавние' },
  { id: 'ai', label: 'ИИ' },
];

/** An article opened in the bar: its heading, then each part with its punishment and its «+». */
function QuickArticle({ hit, added, onCharge, onBack }: { hit: SearchHit; added: (key: string) => boolean; onCharge: (hit: SearchHit) => void; onBack: () => void }) {
  const { article, document } = hit;
  return (
    <article className="quick__article" aria-label={articleHeading(article, document.unit)}>
      <button className="back" type="button" onClick={onBack}>
        <BackIcon />
        <span>Назад</span>
      </button>
      <h2 className="quick__title">
        <DocBadge document={document} /> {articleHeading(article, document.unit)}
      </h2>
      {article.parts.map((part, i) => {
        const partHit = { ...hit, part };
        const key = hitKey(partHit);
        return (
          <section key={part.number ?? `#${i}`} className={part === hit.part ? 'quick__part quick__part--focus' : 'quick__part'}>
            <p className="quick__text">
              {part.number && <b>{part.number}. </b>}
              {part.text}
            </p>
            {part.punishment && (
              <div className="quick__pen">
                {part.stars && <Stars stars={part.stars} />}
                <span>{formatPunishment(part.punishment)}</span>
                <span className="sp" />
                <button className="settings__button" type="button" disabled={added(key)} onClick={() => onCharge(partHit)}>
                  {added(key) ? 'В калькуляторе' : 'В калькулятор'}
                </button>
              </div>
            )}
          </section>
        );
      })}
    </article>
  );
}

/**
 * The quick search (ticket 27; issue #20): a bar of its own over the game, opened by its own key, where the
 * player last dragged it. The laws of the player's server, results under the field; → opens an article in the
 * bar, Enter puts it into the assistant's calculator — pinned over the game at once; «Недавние» lists the recent
 * articles; Tab turns the field to the AI, whose question the assistant answers. What is in the calculator and
 * the recent articles are the assistant's, told to the bar, so nothing is lost when it hides. Esc steps back, then
 * hides the bar; its field keeps what was typed for the next time.
 */
/**
 * The bar before its server's laws are read — a moment at its first showing: the server and its organisations,
 * no documents, so a search finds nothing rather than another server's articles.
 */
const waiting = (server: string): ServerPack => ({ format: 0, ...serverMeta(server), version: '', changes: [], documents: [], synonyms: {} });

export function QuickSearch({ bridge }: { bridge: QuickBridge }) {
  const [organization, setOrganization] = useState<string | undefined>();
  const [pack, setPack] = useState<ServerPack>(() => loadedPack('tverskoi') ?? waiting('tverskoi'));
  const [mode, setMode] = useState<Mode>('laws');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [open, setOpen] = useState<SearchHit | null>(null);
  const [state, setState] = useState<QuickState>({ charges: [], recent: [] });
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const lookup = useHitLookup(pack);

  // The window as tall as the bar and what it shows under it.
  useEffect(() => {
    const element = root.current;
    if (!element || !bridge.fit || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => bridge.fit?.(Math.ceil(element.getBoundingClientRect().height) + 2));
    observer.observe(element);
    return () => observer.disconnect();
  }, [bridge]);

  // What is in the calculator and the recent articles: the assistant's, told on every change and asked for at start.
  useEffect(() => bridge.onState(setState), [bridge]);

  // Each time it is shown: the player's server and faction and the look as they are now, the assistant asked what
  // it has; the field keeps its text, selected, so typing replaces it.
  const load = useCallback(async () => {
    const [profile, look] = await Promise.all([bridge.readSetting<Profile>(PROFILE_KEY), bridge.readSetting<PinLook>(LOOK_KEY)]);
    if (look) applyAppearance(isTheme(look.theme) ? look.theme : 'glass', look.hue);
    const id = profile?.server ?? 'tverskoi';
    setOrganization(profile?.organization);
    const bundled = await loadPack(id);
    const kept = readPack(await bridge.readLaws(id).catch(() => undefined), id);
    setPack(kept && isNewer(kept, bundled) ? kept : bundled);
  }, [bridge]);
  useEffect(() => {
    const shown = () => {
      input.current?.focus();
      input.current?.select();
      void load();
      void bridge.request({ kind: 'hello' });
    };
    shown();
    return bridge.onShown(shown);
  }, [bridge, load]);

  const boostDocuments = pack.organizations.find((o) => o.id === organization)?.documents;
  const hits = useMemo(() => {
    if (mode === 'recent') return state.recent.map(lookup).filter((hit) => hit !== undefined);
    return mode === 'laws' && query.trim() ? searchArticles(pack, query, { boostDocuments }).slice(0, SHOWN) : [];
  }, [pack, query, mode, boostDocuments, state.recent, lookup]);
  // Found nothing: where it looked and what to try (roadmap 1В).
  const noResults = useMemo(
    () => (mode === 'laws' && !hits.length ? explainEmpty(pack, query, { boostDocuments }) : null),
    [mode, hits, pack, query, boostDocuments],
  );
  const current = Math.min(selected, hits.length - 1);
  const punished = (hit: SearchHit) => !!entryPart(hit.article, hit.part)?.punishment;
  const chargeKey = (hit: SearchHit) => hitKey({ ...hit, part: entryPart(hit.article, hit.part) });
  const added = (key: string) => state.charges.includes(key);

  const charge = (hit: SearchHit) => {
    const key = chargeKey(hit);
    if (!added(key)) void bridge.request({ kind: 'charge', key });
    input.current?.focus();
  };
  const openHit = (hit: SearchHit) => {
    setOpen(hit);
    void bridge.request({ kind: 'remember', key: hitKey(hit) });
    input.current?.focus();
  };
  const ask = () => {
    const question = query.trim();
    if (!question) return;
    void bridge.request({ kind: 'ask', question }).then(() => bridge.hide());
  };
  const switchTo = (next: Mode) => {
    setMode(next);
    setOpen(null);
    setSelected(0);
    input.current?.focus();
  };

  // Esc on the window, not the field: a button just clicked has the focus. It steps back, then hides the bar.
  const back = useRef<() => void>(() => {});
  back.current = () => {
    if (open) setOpen(null);
    else void bridge.hide();
    input.current?.focus();
  };
  useEffect(() => {
    const onEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      back.current();
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, []);

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      switchTo(mode === 'ai' ? 'laws' : 'ai');
      return;
    }
    if (mode === 'ai') {
      if (e.key === 'Enter') {
        e.preventDefault();
        ask();
      }
      return;
    }
    // In an article, Enter puts the part it was opened at into the calculator.
    if (open) {
      if (e.key === 'Enter' && punished(open)) {
        e.preventDefault();
        charge(open);
      }
      return;
    }
    if (!hits.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected(Math.min(current + 1, hits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected(Math.max(current - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = hits[current];
      if (punished(hit)) charge(hit);
      else openHit(hit);
    } else if (e.key === 'ArrowRight' && e.currentTarget.selectionStart === e.currentTarget.value.length) {
      e.preventDefault();
      openHit(hits[current]);
    }
  };

  const list = (
    <div className="list" role="list" aria-label={mode === 'recent' ? 'Недавние' : 'Результаты быстрого поиска'}>
      {hits.map((hit, i) => (
        <div role="listitem" key={hitKey(hit)}>
          <ResultRow
            hit={hit}
            selected={i === current}
            onOpen={() => openHit(hit)}
            calculator={punished(hit) ? { added: added(chargeKey(hit)), onToggle: () => charge(hit) } : undefined}
          />
        </div>
      ))}
    </div>
  );

  return (
    <div className="quick glass" role="dialog" aria-label="Быстрый поиск" ref={root}>
      {/* Dragged by its edges — the grip, around the field — to wherever the player wants it. */}
      <div className="quick__bar" data-tauri-drag-region>
        <span className="quick__grip" title="Перетащите, чтобы передвинуть" data-tauri-drag-region>
          <GripIcon size={16} />
        </span>
        {mode === 'ai' ? <SparkIcon size={20} /> : <SearchIcon />}
        <input
          ref={input}
          className="quick__input"
          type="search"
          aria-label={mode === 'ai' ? 'Вопрос ИИ' : 'Быстрый поиск по законам'}
          placeholder={mode === 'ai' ? 'Опишите ситуацию — ответит ИИ в ассистенте' : `Поиск: ${pack.server.name}`}
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
            setOpen(null);
            if (mode === 'recent') setMode('laws');
          }}
          onKeyDown={onKey}
        />
        <div className="seg seg--sm quick__mode" role="radiogroup" aria-label="Что показать">
          {MODES.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} onClick={() => switchTo(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
        <button className="icon-btn icon-btn--sm" type="button" aria-label="Закрыть" title="Закрыть (Esc)" onClick={() => void bridge.hide()}>
          <CloseIcon size={16} />
        </button>
      </div>

      {open ? (
        <div className="quick__body">
          <QuickArticle
            hit={open}
            added={added}
            onCharge={charge}
            onBack={() => {
              setOpen(null);
              input.current?.focus();
            }}
          />
        </div>
      ) : mode === 'ai' ? (
        <p className="quick__hint">
          Enter — вопрос уйдёт ИИ, ответ откроется в ассистенте. <kbd>Tab</kbd> — обратно к законам.
        </p>
      ) : mode === 'recent' ? (
        <div className="quick__body">
          <div className="quick__head">
            <span className="sec-t">Недавние</span>
            {hits.length > 0 && (
              <button className="link-btn" type="button" aria-label="Очистить недавние" onClick={() => void bridge.request({ kind: 'clear-recent' })}>
                Очистить
              </button>
            )}
          </div>
          {hits.length > 0 ? list : <p className="quick__hint quick__hint--in">Здесь появятся статьи, которые вы открывали.</p>}
        </div>
      ) : hits.length > 0 ? (
        <div className="quick__body">{list}</div>
      ) : (
        query.trim() && (
          <div className="quick__hint">
            {noResults && (
              <NoResults
                compact
                empty={noResults}
                onTry={(to) => {
                  setQuery(to.query);
                  setSelected(0);
                  input.current?.focus();
                }}
              />
            )}
            <p className="quick__ask">
              <kbd>Tab</kbd> — спросить ИИ.
            </p>
          </div>
        )
      )}

      <div className="quick__foot" data-tauri-drag-region>
        {mode !== 'ai' && !open && (
          <>
            <span>
              <kbd>↑</kbd>
              <kbd>↓</kbd> выбор
            </span>
            <span>
              <kbd>→</kbd> открыть
            </span>
          </>
        )}
        <span>
          <kbd>Enter</kbd> {mode === 'ai' ? 'спросить ИИ' : 'в калькулятор'}
        </span>
        <span>
          <kbd>Tab</kbd> {mode === 'ai' ? 'законы' : 'ИИ'}
        </span>
        <span>
          <kbd>Esc</kbd> {open ? 'назад' : 'закрыть'}
        </span>
        {state.charges.length > 0 && (
          <>
            <button className="quick__sent" type="button" onClick={() => void bridge.request({ kind: 'open-calculator' })}>
              <CheckIcon size={14} /> В калькуляторе: {state.charges.length} · <CalculatorIcon size={14} /> Открыть
            </button>
            {/* Emptied from here, without opening the assistant (issue #23). */}
            <button className="quick__clear" type="button" aria-label="Очистить калькулятор" title="Убрать все статьи из калькулятора" onClick={() => void bridge.request({ kind: 'clear-charges' })}>
              Очистить
            </button>
          </>
        )}
      </div>
    </div>
  );
}
