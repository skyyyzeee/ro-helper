import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  calculateDetention,
  changedArticles,
  changesSince,
  chapterHeading,
  documentContents,
  leadPart,
  recentChanges,
  searchArticles,
  type ChangeEntry,
  type Charge,
  type ChargeItem,
  type Mode,
  type Offender,
  type Part,
  type SearchHit,
  type ServerPack,
} from '../core';
import { usePlatform } from '../platform/PlatformContext';
import { ArticleView } from './ArticleView';
import { CalculatorPanel, type ChargeFields, type ChargePatch, type CopyState } from './CalculatorPanel';
import { ChangeDiff, ChangesView, type ChangeRef } from './ChangesView';
import { DocumentsMenu } from './DocumentsMenu';
import { CloseIcon, MenuIcon, SearchIcon, SettingsIcon } from './icons';
import { DEFAULT_OPACITY, OPACITY_KEY, applyOpacity, clampOpacity } from './overlaySettings';
import type { Profile } from './profile';
import { PinCardView } from './PinCardView';
import { articlePinCard, calculatorPinCard } from './pinCards';
import { ResizeEdges } from './ResizeEdges';
import { ResultRow } from './ResultRow';
import { RECENT_LIMIT, entryPart, favoritesKey, hitKey, recentKey, useHitLookup, useStoredKeys } from './saved';
import { SettingsPanel } from './SettingsPanel';
import { UpdateBanner } from './UpdateBanner';
import { useUpdates } from './updates';

/** «1 результат», «3 результата», «11 результатов». */
function plural(n: number, [one, few, many]: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} ${one}`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} ${few}`;
  return `${n} ${many}`;
}

/** The version of the laws the user last saw, per server. */
const seenKey = (server: string) => `laws.seen:${server}`;
/** Articles changed this recently are marked in the results. */
const CHANGED_DAYS = 14;
/** How far back «Что изменилось» from the settings goes. */
const LIST_DAYS = 60;

/** What is pinned over the game: one article's part, or the calculator, whose card follows it. */
type Pinned = { kind: 'article'; hit: SearchHit } | { kind: 'calculator' };

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
  const [open, setOpen] = useState<SearchHit | null>(null);
  const [selected, setSelected] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [opacity, setOpacity] = useState(DEFAULT_OPACITY);
  const organization = pack.organizations.find((o) => o.id === profile.organization);
  const boostDocuments = organization?.documents;
  // A document picked in the menu narrows the search; with no query it shows as a table of contents.
  const [scopeId, setScopeId] = useState<string | null>(null);
  const scope = scopeId ? pack.documents.find((d) => d.id === scopeId) : undefined;
  const hits = useMemo(
    () => searchArticles(pack, query, { boostDocuments, document: scope?.id }),
    [pack, query, boostDocuments, scope],
  );
  const contents = useMemo(() => (scope ? documentContents(scope) : []), [scope]);
  /** Where each chapter's rows start in the list ↑↓ walk through. */
  const chapterStarts = contents.map((_, g) => contents.slice(0, g).reduce((n, group) => n + group.hits.length, 0));
  const summary = [pack.server.name, organization && organization.id !== 'none' ? organization.name : null].filter(Boolean).join(' · ');

  // An empty search shows the favourites, then the recent articles without them; ↑↓ go through both.
  const lookup = useHitLookup(pack);
  const [favoriteKeys, updateFavorites] = useStoredKeys(platform, favoritesKey(pack.server.id));
  const [recentKeys, updateRecent] = useStoredKeys(platform, recentKey(pack.server.id));
  const favorites = useMemo(() => favoriteKeys.map(lookup).filter((hit) => hit !== undefined), [favoriteKeys, lookup]);
  const recent = useMemo(
    () => recentKeys.filter((key) => !favoriteKeys.includes(key)).map(lookup).filter((hit) => hit !== undefined),
    [recentKeys, favoriteKeys, lookup],
  );
  const view: 'home' | 'contents' | 'results' = query.trim() ? 'results' : scope ? 'contents' : 'home';
  const home = view === 'home';
  const listed = home ? [...favorites, ...recent] : view === 'contents' ? contents.flatMap((group) => group.hits) : hits;
  const current = Math.min(selected, listed.length - 1);
  const remember = (hit: SearchHit) => {
    const key = hitKey(hit);
    updateRecent((list) => [key, ...list.filter((k) => k !== key)].slice(0, RECENT_LIMIT));
    // On the home lists the article moves to the top of the recent ones; the selection goes with it.
    if (home && !favoriteKeys.includes(key)) setSelected(favorites.length);
  };
  const toggleFavorite = (hit: SearchHit) => {
    const key = hitKey(hit);
    updateFavorites((list) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]));
  };

  // New versions of the app, offered under the header.
  const updates = useUpdates();

  // «Что изменилось»: shown once after an update of the laws, and from the settings. Articles changed in the
  // last two weeks are marked in the results and lead to «было → стало».
  const [changesView, setChangesView] = useState<{ entries: ChangeEntry[]; title: string } | null>(null);
  const [diff, setDiff] = useState<ChangeRef | null>(null);
  const changed = useMemo(() => changedArticles(recentChanges(pack, new Date(), CHANGED_DAYS)), [pack]);
  useEffect(() => {
    const key = seenKey(pack.server.id);
    void platform.readSetting<string>(key).then((seen) => {
      // The first launch has nothing to compare with; later, whatever came since the last one shows once.
      const fresh = seen === undefined ? [] : changesSince(pack, seen);
      if (fresh.length) setChangesView({ entries: fresh, title: 'С прошлого обновления' });
      if (seen !== pack.version) void platform.writeSetting(key, pack.version);
    });
  }, [platform, pack]);
  const showRecentChanges = () => {
    setSettingsOpen(false);
    setOpen(null);
    setDiff(null);
    setChangesView({ entries: recentChanges(pack, new Date(), LIST_DAYS), title: `За ${LIST_DAYS} дней` });
  };
  /** The article as it is now, for a change: to open it whole. */
  const hitForArticle = (articleId: string): SearchHit | undefined => {
    for (const document of pack.documents) {
      const article = document.articles.find((a) => a.id === articleId);
      if (article) return { article, document, part: entryPart(article) };
    }
    return undefined;
  };
  const changeOf = (hit: SearchHit) => changed.get(hit.article.id);

  // Calculator: charges of both codes, the mode and the offender for the whole detention, the fine typed in.
  const [charges, setCharges] = useState<Entry[]>([]);
  const [mode, setMode] = useState<Mode>('custody');
  const [offender, setOffender] = useState<Offender>('citizen');
  const [fineInput, setFineInput] = useState('');
  const [side, setSide] = useState<'left' | 'right'>('left');
  const calculable = [pack.calculator.criminalCode, pack.calculator.administrative.code];
  const addable = (hit: SearchHit) => calculable.includes(hit.document.id) && !!(hit.part ?? leadPart(hit.article))?.punishment;
  const inCalculator = (hit: SearchHit) => charges.some((c) => c.key === hitKey(hit));
  const toggleCharge = (hit: SearchHit) => {
    const key = hitKey(hit);
    if (!inCalculator(hit)) remember(hit);
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

  // Pinned card: pinning hides the overlay; the calculator's card follows the calculator and goes with it.
  const [pinned, setPinned] = useState<Pinned | null>(null);
  const articleCard = useMemo(() => (pinned?.kind === 'article' ? articlePinCard(pinned.hit, pack.calculator) : null), [pinned, pack.calculator]);
  const calculatorCard = useMemo(
    () => (pinned?.kind === 'calculator' && calculatorOpen ? calculatorPinCard(result, typedNumber(fineInput)) : null),
    [pinned, calculatorOpen, result, fineInput],
  );
  const pinCard = articleCard ?? calculatorCard;
  useEffect(() => {
    if (pinCard) void platform.showPin(pinCard);
  }, [pinCard, platform]);
  useEffect(() => {
    if (pinned?.kind !== 'calculator' || calculatorOpen) return;
    setPinned(null);
    void platform.hidePin();
  }, [pinned, calculatorOpen, platform]);
  useEffect(() => platform.onPinClosed(() => setPinned(null)), [platform]);
  const pin = (next: Pinned) => {
    setPinned(next);
    void platform.hideOverlay();
  };
  const unpin = () => {
    setPinned(null);
    void platform.hidePin();
  };

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
    if (e.key === 'Backspace' && !query && scope) {
      // Backspace in an empty field takes the document off, as if it were the first word.
      e.preventDefault();
      clearScope();
      return;
    }
    // «Что изменилось» and «было → стало» are read with the mouse; the list keys would move a hidden selection.
    if (diff || (changesView && !open)) return;
    if (open) {
      // Enter in an open article puts its part into the calculator, or takes it out.
      if (e.key === 'Enter' && addable(open)) {
        e.preventDefault();
        toggleCharge({ ...open, part: entryPart(open.article, open.part) });
      }
      return;
    }
    if (!listed.length) return;
    const input = e.currentTarget;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected(Math.min(current + 1, listed.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected(Math.max(current - 1, 0));
    } else if (e.key === 'Enter') {
      // Enter puts a punished article into the calculator; an article without a punishment opens instead.
      e.preventDefault();
      const hit = listed[current];
      if (!hit) return;
      if (addable(hit)) toggleCharge(hit);
      else openHit(hit);
    } else if (e.key === 'ArrowRight' && input.selectionStart === input.value.length && input.selectionEnd === input.value.length) {
      // → opens the article once the caret is at the end, so it still moves the caret through the text.
      e.preventDefault();
      openHit(listed[current]);
    }
  };

  const clearScope = () => {
    setScopeId(null);
    setOpen(null);
    setSelected(0);
    searchRef.current?.focus();
  };
  const pickDocument = (id: string) => {
    setScopeId(id);
    setQuery('');
    setOpen(null);
    setSelected(0);
    setMenuOpen(false);
    searchRef.current?.focus();
  };

  /** Esc steps back one layer at a time: settings → menu → article → search text → document → hide the overlay. */
  const stepBack = useRef<() => void>(() => {});
  stepBack.current = () => {
    if (settingsOpen) setSettingsOpen(false);
    else if (menuOpen) setMenuOpen(false);
    else if (diff) setDiff(null);
    else if (open) setOpen(null);
    else if (changesView) setChangesView(null);
    else if (query) {
      setQuery('');
      setSelected(0);
    } else if (scope) clearScope();
    else void platform.hideOverlay();
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
    setOpen(hit);
    remember(hit);
    searchRef.current?.focus();
  };
  /** The article's part as a hit of its own, for the calculator. */
  const partHit = (hit: SearchHit, part?: Part): SearchHit => ({ article: hit.article, document: hit.document, part: part ?? entryPart(hit.article) });
  const rowFor = (hit: SearchHit, i: number, inChapter = false) => (
    <div role="listitem" key={hitKey(hit)}>
      <ResultRow
        hit={hit}
        selected={i === current}
        inChapter={inChapter}
        changed={!!changeOf(hit)}
        onOpen={() => openHit(hit)}
        calculator={addable(hit) ? { added: inCalculator(hit), onToggle: () => toggleCharge(hit) } : undefined}
      />
    </div>
  );

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
    <>
    {/* In the browser there is no second window: the stand-in game scene shows the card itself. */}
    {platform.kind === 'browser' && pinCard && (
      <div className="pin-preview">
        <PinCardView card={pinCard} live onClose={unpin} />
      </div>
    )}
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
          onPin={() => pin({ kind: 'calculator' })}
        />
      )}
    <div className="overlay glass">
      <div className="overlay__head" data-tauri-drag-region>
        <button
          className={menuOpen ? 'icon-btn icon-btn--on' : 'icon-btn'}
          type="button"
          aria-label="Все документы"
          aria-expanded={menuOpen}
          title="Все документы"
          onClick={() => setMenuOpen((v) => !v)}
        >
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
        <SettingsPanel
          summary={summary}
          hotkey={profile.hotkey}
          opacity={opacity}
          onOpacity={changeOpacity}
          onEditProfile={onEditProfile}
          onChanges={showRecentChanges}
          updates={updates}
        />
      )}
      <UpdateBanner updates={updates} />

      <div className="search">
        <SearchIcon />
        {scope && (
          <button className="scope" type="button" aria-label={`Искать во всех документах, а не только в ${scope.short}`} title="Искать во всех документах" onClick={clearScope}>
            <span>{scope.short}</span>
            <CloseIcon size={12} />
          </button>
        )}
        <input
          ref={searchRef}
          className="search__input"
          type="search"
          aria-label="Поиск по законам"
          placeholder={scope ? `Поиск: ${scope.title}` : 'Номер или слова: 65, коап 8.6, кража'}
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(null);
            setDiff(null);
            setChangesView(null);
            setSelected(0);
          }}
          onKeyDown={onSearchKey}
        />
        <span className="kbd">Esc</span>
      </div>

      <div className="overlay__content">
        {diff ? (
          <ChangeDiff
            pack={pack}
            target={diff}
            backLabel={open ? 'Статья' : changesView ? 'Что изменилось' : 'Назад'}
            onBack={() => {
              setDiff(null);
              searchRef.current?.focus();
            }}
            onOpenArticle={
              // From the article itself «←» already leads back to it.
              open?.article.id !== diff.change.articleId && hitForArticle(diff.change.articleId)
                ? () => {
                    setDiff(null);
                    setOpen(hitForArticle(diff.change.articleId)!);
                    searchRef.current?.focus();
                  }
                : undefined
            }
          />
        ) : open ? (
          <ArticleView
            article={open.article}
            document={open.document}
            focusPart={open.part}
            backLabel={changesView ? 'Что изменилось' : home ? 'Избранное и недавние' : view === 'contents' ? 'Оглавление' : 'Результаты'}
            changed={(() => {
              const recentChange = changeOf(open);
              return recentChange && recentChange.change.kind === 'changed'
                ? { date: recentChange.entry.version, onOpen: () => setDiff(recentChange) }
                : undefined;
            })()}
            onBack={() => {
              setOpen(null);
              searchRef.current?.focus();
            }}
            monthsPerStar={open.document.id === pack.calculator.criminalCode ? pack.calculator.stars.monthsPerStar : undefined}
            calculator={
              addable(open)
                ? { has: (part) => inCalculator(partHit(open, part)), toggle: (part) => toggleCharge(partHit(open, part)) }
                : undefined
            }
            favorite={favoriteKeys.includes(hitKey(open))}
            onFavorite={() => toggleFavorite(open)}
            onPin={() => pin({ kind: 'article', hit: open })}
          />
        ) : changesView ? (
          <ChangesView
            pack={pack}
            entries={changesView.entries}
            title={changesView.title}
            onOpen={(ref) => {
              const hit = ref.change.kind === 'added' ? hitForArticle(ref.change.articleId) : undefined;
              if (hit) setOpen(hit);
              else setDiff(ref);
              searchRef.current?.focus();
            }}
            onBack={() => {
              setChangesView(null);
              searchRef.current?.focus();
            }}
          />
        ) : home ? (
          <>
            {favorites.length > 0 && (
              <>
                <div className="sec-t home__title">Избранное</div>
                <div className="list" role="list" aria-label="Избранное">
                  {favorites.map((hit, i) => rowFor(hit, i))}
                </div>
              </>
            )}
            {recent.length > 0 && (
              <>
                <div className="sec-t home__title">Недавние</div>
                <div className="list" role="list" aria-label="Недавние">
                  {recent.map((hit, i) => rowFor(hit, favorites.length + i))}
                </div>
              </>
            )}
            {listed.length === 0 && <div className="empty">Здесь появятся избранные и недавние статьи</div>}
          </>
        ) : view === 'contents' && scope ? (
          <>
            <div className="meta">
              <span>{scope.title}</span>
              <span>{plural(scope.articles.length, ['статья', 'статьи', 'статей'])}</span>
            </div>
            <div className="toc" aria-label={`Оглавление: ${scope.title}`}>
              {contents.map((group, g) => (
                <section
                  key={group.chapter?.number ?? `none-${g}`}
                  className="toc__chapter"
                  aria-label={group.chapter ? chapterHeading(group.chapter).replace(/\..*$/, '') : 'Без главы'}
                >
                  {group.chapter && <h3 className="toc__title">{chapterHeading(group.chapter)}</h3>}
                  <div className="list" role="list">
                    {group.hits.map((hit, i) => rowFor(hit, chapterStarts[g] + i, true))}
                  </div>
                </section>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="meta">
              <span>{plural(hits.length, ['результат', 'результата', 'результатов'])}</span>
              <span>{scope ? scope.title : 'все документы'}</span>
            </div>
            <div className="list" role="list" aria-label="Результаты поиска">
              {hits.map((hit, i) => rowFor(hit, i))}
            </div>
            {hits.length === 0 && <div className="empty">Ничего не найдено</div>}
          </>
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

      {menuOpen && (
        <DocumentsMenu
          pack={pack}
          organization={organization}
          current={scope?.id}
          onPick={(document) => pickDocument(document.id)}
          onClose={() => {
            setMenuOpen(false);
            searchRef.current?.focus();
          }}
        />
      )}
    </div>
    </div>
    </>
  );
}
