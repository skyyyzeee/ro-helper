import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
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
import { packFor } from '../data';
import type { PinCard, PinGroup, Toast } from '../platform/types';
import { usePlatform } from '../platform/PlatformContext';
import { ArticleView } from './ArticleView';
import { CalculatorPanel, type ChargeFields, type ChargePatch, type CopyState } from './CalculatorPanel';
import { ChangeDiff, ChangesView, type ChangeRef } from './ChangesView';
import { DocumentsMenu } from './DocumentsMenu';
import { BackIcon, CloseIcon, MenuIcon, SearchIcon, SettingsIcon } from './icons';
import { DEFAULT_OPACITY, OPACITY_KEY, applyOpacity, clampOpacity } from './overlaySettings';
import { formatHotkey, type Profile } from './profile';
import { OrganizationChoice } from './OrganizationChoice';
import { PinSurface } from './PinSurface';
import { PrivacyView } from './PrivacyView';
import { ReleaseNotesView } from './ReleaseNotesView';
import { articlePinCard, calculatorPinCard } from './pinCards';
import { CALCULATOR_ID, hasCard, keepableGroups, pinCard, restoreGroups, surfaceNow, unpinCard, updateCard } from './pinLayout';
import { applyPreset, cardCount, deletePreset, nextPresetName, presetsKey, readPresets, savePreset, type PinPreset } from './pinPresets';
import { ResizeEdges } from './ResizeEdges';
import { ResultRow } from './ResultRow';
import { RECENT_LIMIT, entryPart, favoritesKey, hitKey, recentKey, useHitLookup, useStoredKeys } from './saved';
import { ServerChoice } from './ServerChoice';
import { SettingsView } from './SettingsView';
import type { Laws } from './laws';
import { APP_VERSION } from './about';
import { WhatsNewView } from './WhatsNewView';
import { CHANGELOG, SEEN_VERSION_KEY, compareVersions, notesSince, type VersionNotes } from './whatsNew';
import { UpdateBanner } from './UpdateBanner';
import { DISMISSED_KEY, TOASTED_KEY, useUpdates } from './updates';

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

/** What is pinned over the game, per server: blocks of cards where the user put them. */
const pinsKey = (server: string) => `pins:${server}`;

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

export function Overlay({
  pack,
  profile,
  onEditProfile,
  onProfile,
  onCapturing,
  laws,
  newUser = false,
}: {
  pack: ServerPack;
  profile: Profile;
  /** Opens the first-launch steps again: server, organisation and hotkey in a row. */
  onEditProfile: () => void;
  /** Saves a changed profile — the server, the organisation or the hotkey, changed in the settings. */
  onProfile: (next: Profile) => void;
  /** While a hotkey is being recorded no global hotkey may be registered. */
  onCapturing: (capturing: boolean) => void;
  /** Checking for newer laws from the settings, and what the last check found. */
  laws?: Pick<Laws, 'status' | 'check'>;
  /** This session began at the first launch: there is nothing new to tell. */
  newUser?: boolean;
}) {
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

  // New versions of the app, offered under the header; the privacy policy, opened from the settings.
  const updates = useUpdates();
  // A new version is told once over the game, top right, even with the overlay hidden: the offer under
  // the header is seen only by whoever opens the helper. One put off with «Позже» is not told again.
  const [previewToast, setPreviewToast] = useState<Toast | null>(null);
  const found = updates.status.kind === 'available' ? updates.status.update.version : null;
  useEffect(() => {
    if (!found) return;
    let active = true;
    void Promise.all([platform.readSetting<string>(TOASTED_KEY), platform.readSetting<string>(DISMISSED_KEY)]).then(([told, putOff]) => {
      if (!active || told === found || putOff === found) return;
      const toast: Toast = {
        id: `update-${found}`,
        title: 'Вышло обновление РО Хелпер',
        text: `Версия ${found}. Откройте хелпер (${formatHotkey(profile.hotkey)}) и нажмите «Обновить».`,
      };
      void platform.showToast(toast);
      // In the browser there is no window over the game: the stand-in scene shows the notice itself.
      if (platform.kind === 'browser') setPreviewToast(toast);
      void platform.writeSetting(TOASTED_KEY, found);
    });
    return () => {
      active = false;
    };
  }, [found, platform, profile.hotkey]);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [organizationOpen, setOrganizationOpen] = useState(false);
  const [serverOpen, setServerOpen] = useState(false);
  // «Что нового»: once after the app was updated — every version since the one last run — and the whole
  // history from the settings.
  const [whatsNew, setWhatsNew] = useState<{ title: string; sections: VersionNotes[]; backLabel: string } | null>(null);
  useEffect(() => {
    void platform.readSetting<string>(SEEN_VERSION_KEY).then((seen) => {
      if (seen !== APP_VERSION) void platform.writeSetting(SEEN_VERSION_KEY, APP_VERSION);
      // Just installed, the same version, or an older one put back: nothing to tell.
      if (newUser || seen === APP_VERSION || (seen !== undefined && compareVersions(seen, APP_VERSION) > 0)) return;
      const sections = notesSince(seen, APP_VERSION);
      if (sections.length) setWhatsNew({ title: `Хелпер обновлён до версии ${APP_VERSION}`, sections, backLabel: 'Закрыть' });
    });
    // Once, at the start of the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform]);
  // «Что нового» of the version on offer, opened from the offer.
  const [notesOpen, setNotesOpen] = useState(false);
  const offered = updates.status.kind === 'available' || updates.status.kind === 'failed' ? updates.status.update : null;
  const notesFor = notesOpen ? offered : null;

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
  /** Арбатский: bail goes by the wanted priority the officer sets, 1 by default. */
  const [priority, setPriority] = useState(1);
  const [side, setSide] = useState<'left' | 'right'>('left');
  const rules = pack.calculator;
  const calculable = rules ? [rules.criminalCode, rules.administrative.code] : [];
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
  const result = useMemo(
    () => (rules ? calculateDetention(items, { mode, offender, priority }, rules) : null),
    [items, mode, offender, priority, rules],
  );
  const priorityLevels = rules?.bail.by === 'wanted' ? Object.keys(rules.bail.amounts).map(Number).sort((a, b) => a - b) : null;
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
    setPriority(1);
  }, [calculatorOpen]);

  // Pinned over the game: any number of cards, each where the user dragged it, kept for the next launch.
  // Pinning an article leaves the overlay open for the next search; pinning the calculator hides it.
  const [groups, setGroups] = useState<PinGroup[]>([]);
  const [pinsReady, setPinsReady] = useState(false);
  const pins = pinsKey(pack.server.id);
  const surface = () => surfaceNow(platform.kind === 'browser');
  useEffect(() => {
    let active = true;
    setPinsReady(false);
    void platform.readSetting<PinGroup[]>(pins).then((saved) => {
      if (!active) return;
      // The calculator's card belongs to a detention that is long over.
      setGroups(Array.isArray(saved) ? keepableGroups(restoreGroups(saved)) : []);
      setPinsReady(true);
    });
    return () => {
      active = false;
    };
  }, [platform, pins]);
  useEffect(() => {
    if (!pinsReady) return;
    void platform.setPins(groups);
    void platform.writeSetting(pins, keepableGroups(groups));
  }, [pinsReady, groups, platform, pins]);
  // Moving, joining and closing happen on the cards themselves.
  useEffect(() => platform.onPinsChanged(setGroups), [platform]);

  // Sets of pinned cards saved under a name, per server, to put back over the game at once.
  const [presets, setPresets] = useState<PinPreset[]>([]);
  const presetsSetting = presetsKey(pack.server.id);
  useEffect(() => {
    let active = true;
    setPresets([]);
    void platform.readSetting(presetsSetting).then((saved) => {
      if (active) setPresets(readPresets(saved));
    });
    return () => {
      active = false;
    };
  }, [platform, presetsSetting]);
  const changePresets = (change: (list: PinPreset[]) => PinPreset[]) => {
    const next = change(presets);
    setPresets(next);
    void platform.writeSetting(presetsSetting, next);
  };

  const pinnedArticle = open ? hasCard(groups, hitKey(open)) : false;
  const pinnedCalculator = hasCard(groups, CALCULATOR_ID);
  const togglePin = (card: PinCard) =>
    setGroups((list) => (hasCard(list, card.id) ? unpinCard(list, card.id) : pinCard(list, card, surface())));

  // The pinned total follows the calculator, and goes when the charges do.
  const calculatorCard = useMemo(
    () => (calculatorOpen && result ? calculatorPinCard(result, typedNumber(fineInput)) : null),
    [calculatorOpen, result, fineInput],
  );
  useEffect(() => {
    setGroups((list) => (calculatorCard ? updateCard(list, calculatorCard) : unpinCard(list, CALCULATOR_ID)));
  }, [calculatorCard]);

  const [copyState, setCopyState] = useState<CopyState>('idle');
  const copyTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(copyTimer.current), []);
  const copyCharges = () => {
    if (!result?.charge) return;
    const show = (state: CopyState) => {
      setCopyState(state);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopyState('idle'), 1500);
    };
    platform.writeClipboard(result.charge!).then(
      () => show('copied'),
      () => show('failed'),
    );
  };
  /** Ctrl+C copies the charges, unless there is text selected to copy. Says whether it did. */
  const copyShortcut = useRef<() => boolean>(() => false);
  copyShortcut.current = () => {
    if (!result?.charge || hasSelectedText()) return false;
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
    if (whatsNew || settingsOpen || organizationOpen || serverOpen || notesFor || privacyOpen || diff || (changesView && !open)) return;
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

  /** Esc steps back one layer at a time: a screen over the settings → the settings → menu → article →
   * search text → document → hide the overlay. */
  const stepBack = useRef<() => void>(() => {});
  stepBack.current = () => {
    if (menuOpen) setMenuOpen(false);
    else if (whatsNew) setWhatsNew(null);
    else if (organizationOpen) setOrganizationOpen(false);
    else if (serverOpen) setServerOpen(false);
    else if (notesFor) setNotesOpen(false);
    else if (privacyOpen) setPrivacyOpen(false);
    else if (diff) setDiff(null);
    else if (changesView && settingsOpen) setChangesView(null);
    else if (settingsOpen) setSettingsOpen(false);
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
  // Back from an article (or any screen over the list) the list is where it was left, not at its top;
  // what is opened starts at its own top.
  const contentRef = useRef<HTMLDivElement>(null);
  const listScroll = useRef(0);
  const onList = !whatsNew && !settingsOpen && !organizationOpen && !serverOpen && !notesFor && !privacyOpen && !diff && !open && !changesView;
  const wasOnList = useRef(onList);
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (content && onList !== wasOnList.current) content.scrollTop = onList ? listScroll.current : 0;
    wasOnList.current = onList;
  }, [onList]);

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

  // Shown again, the panel fades in: the window is only hidden, so the class replays the animation.
  const [entering, setEntering] = useState(false);
  useEffect(() => {
    const timer = { id: undefined as ReturnType<typeof setTimeout> | undefined };
    const stop = platform.onOverlayShown(() => {
      setEntering(true);
      clearTimeout(timer.id);
      timer.id = setTimeout(() => setEntering(false), 240);
    });
    return () => {
      clearTimeout(timer.id);
      stop();
    };
  }, [platform]);

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
    {/* In the browser there is no second window: the stand-in game scene shows the cards itself. */}
    {platform.kind === 'browser' && (
      <PinSurface groups={groups} live onChange={setGroups} toast={previewToast} onToastEnd={() => setPreviewToast(null)} />
    )}
    <div className={`shell shell--${side}`}>
      {platform.kind === 'tauri' && <ResizeEdges />}
      {calculatorOpen && result && (
        <CalculatorPanel
          result={result}
          onMode={setMode}
          onOffender={setOffender}
          priority={priorityLevels ? { value: priority, levels: priorityLevels, onChange: setPriority } : undefined}
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
          pinned={pinnedCalculator}
          onPin={() => {
            if (!result) return;
            togglePin(calculatorPinCard(result, typedNumber(fineInput)));
            if (!pinnedCalculator) void platform.hideOverlay();
          }}
        />
      )}
    <div className={entering ? 'overlay glass overlay--enter' : 'overlay glass'}>
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

      <UpdateBanner
        updates={updates}
        onNotes={() => {
          setSettingsOpen(false);
          setNotesOpen(true);
        }}
      />

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
            setPrivacyOpen(false);
            setNotesOpen(false);
            setOrganizationOpen(false);
            setServerOpen(false);
            setSettingsOpen(false);
            setWhatsNew(null);
            setChangesView(null);
            setSelected(0);
          }}
          onKeyDown={onSearchKey}
        />
        <span className="kbd">Esc</span>
      </div>

      <div
        ref={contentRef}
        className="overlay__content"
        onScroll={(e) => {
          if (onList) listScroll.current = e.currentTarget.scrollTop;
        }}
      >
        {whatsNew ? (
          <WhatsNewView
            title={whatsNew.title}
            sections={whatsNew.sections}
            backLabel={whatsNew.backLabel}
            onBack={() => {
              setWhatsNew(null);
              searchRef.current?.focus();
            }}
          />
        ) : organizationOpen ? (
          <section className="art" aria-label="Ваша организация">
            <button
              className="back"
              type="button"
              onClick={() => {
                setOrganizationOpen(false);
                searchRef.current?.focus();
              }}
            >
              <BackIcon />
              <span>{settingsOpen ? 'Настройки' : 'Назад'}</span>
            </button>
            <h2 className="art__title">Ваша организация</h2>
            <p className="ob__sub">Её законы и устав идут первыми в поиске. Документы остальных организаций тоже доступны.</p>
            <OrganizationChoice
              pack={pack}
              value={profile.organization}
              onPick={(id) => {
                onProfile({ ...profile, organization: id });
                setOrganizationOpen(false);
                searchRef.current?.focus();
              }}
            />
          </section>
        ) : serverOpen ? (
          <section className="art" aria-label="Ваш сервер">
            <button
              className="back"
              type="button"
              onClick={() => {
                setServerOpen(false);
                searchRef.current?.focus();
              }}
            >
              <BackIcon />
              <span>Настройки</span>
            </button>
            <h2 className="art__title">Ваш сервер</h2>
            <p className="ob__sub">Законы и правила берутся из законодательной базы выбранного сервера.</p>
            <ServerChoice
              value={profile.server}
              onPick={(id) => {
                // Another server has its own organisations: one it does not have goes back to «Без организации».
                const keep = packFor(id).organizations.some((o) => o.id === profile.organization);
                onProfile({ ...profile, server: id, organization: keep ? profile.organization : 'none' });
                setServerOpen(false);
                searchRef.current?.focus();
              }}
            />
          </section>
        ) : notesFor ? (
          <ReleaseNotesView
            update={notesFor}
            onBack={() => {
              setNotesOpen(false);
              searchRef.current?.focus();
            }}
            onInstall={() => {
              setNotesOpen(false);
              updates.install();
            }}
          />
        ) : privacyOpen ? (
          <PrivacyView
            backLabel={settingsOpen ? 'Настройки' : 'Назад'}
            onBack={() => {
              setPrivacyOpen(false);
              searchRef.current?.focus();
            }}
          />
        ) : diff ? (
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
        ) : settingsOpen && !changesView ? (
          <SettingsView
            backLabel={open ? 'Статья' : 'Поиск'}
            onBack={() => {
              setSettingsOpen(false);
              searchRef.current?.focus();
            }}
            pack={pack}
            organization={organization}
            onServer={() => setServerOpen(true)}
            onOrganization={() => setOrganizationOpen(true)}
            onEditProfile={onEditProfile}
            hotkey={profile.hotkey}
            onHotkey={(accelerator) => onProfile({ ...profile, hotkey: accelerator })}
            onCapturing={onCapturing}
            opacity={opacity}
            onOpacity={changeOpacity}
            pinned={cardCount(groups)}
            onUnpinAll={() => setGroups([])}
            presets={presets.map((preset) => ({ id: preset.id, name: preset.name, count: cardCount(preset.groups) }))}
            nextPresetName={nextPresetName(presets)}
            onSavePreset={(name) => changePresets((list) => savePreset(list, name, groups))}
            onApplyPreset={(id) => {
              const preset = presets.find((p) => p.id === id);
              if (preset) setGroups((list) => applyPreset(list, preset));
            }}
            onDeletePreset={(id) => changePresets((list) => deletePreset(list, id))}
            onChanges={showRecentChanges}
            updates={updates}
            onPrivacy={() => setPrivacyOpen(true)}
            laws={laws}
            onHistory={() => setWhatsNew({ title: 'История версий', sections: CHANGELOG, backLabel: 'Настройки' })}
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
            monthsPerStar={rules?.stars && open.document.id === rules.criminalCode ? rules.stars.monthsPerStar : undefined}
            calculator={
              addable(open)
                ? { has: (part) => inCalculator(partHit(open, part)), toggle: (part) => toggleCharge(partHit(open, part)) }
                : undefined
            }
            favorite={favoriteKeys.includes(hitKey(open))}
            onFavorite={() => toggleFavorite(open)}
            pinned={pinnedArticle}
            onPin={() => togglePin(articlePinCard(open, rules))}
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
