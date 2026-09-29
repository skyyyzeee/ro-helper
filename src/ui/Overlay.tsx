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
  type Stage,
  type Offender,
  type Part,
  type SearchHit,
  type ServerPack,
} from '../core';
import { packFor } from '../data';
import type { PinCard, PinGroup, Toast } from '../platform/types';
import { usePlatform } from '../platform/PlatformContext';
import type { AppearanceControl } from './appearance';
import { ArticleView } from './ArticleView';
import { CalculatorPanel, type ChargeFields, type ChargePatch, type CopyState } from './CalculatorPanel';
import { ChangeDiff, ChangesView, type ChangeRef } from './ChangesView';
import { DocumentsMenu } from './DocumentsMenu';
import { transcribe, useAiChat } from './ai';
import { AiView, type AiTab } from './AiView';
import { cardText } from './AnswerView';
import { DocumentView } from './DocumentView';
import { TrainerView } from './TrainerView';
import { LawyerView } from './LawyerView';
import { useLawyerCheck } from './lawyer';
import { useTrainer } from './trainer';
import { useDocumentWriter } from './documents';
import { HistoryView } from './HistoryView';
import { BackIcon, CalculatorIcon, ChevronDownIcon, CloseIcon, DocumentsIcon, HistoryIcon, MemoIcon, MicIcon, OrganizationIcon, PinIcon, ProfileIcon, SearchIcon, ServerIcon, SettingsIcon, SparkIcon } from './icons';
import { SideRail } from './SideRail';
import { canRecord, startRecording, type Recording } from './voice';
import { DEFAULT_OPACITY, DEFAULT_VOICE_HOTKEY, OPACITY_KEY, VOICE_HOTKEY_KEY, applyOpacity, clampOpacity } from './overlaySettings';
import { formatHotkey, type Profile } from './profile';
import { OrganizationChoice } from './OrganizationChoice';
import { PinSurface } from './PinSurface';
import { PrivacyView } from './PrivacyView';
import { ReleaseNotesView } from './ReleaseNotesView';
import { aiPinCard, articlePinCard, calculatorPinCard } from './pinCards';
import { CALCULATOR_ID, hasCard, keepableGroups, pinCard, restoreGroups, surfaceNow, unpinCard, updateCard } from './pinLayout';
import { applyPreset, cardCount, deletePreset, nextPresetName, presetsKey, readPresets, savePreset, type PinPreset } from './pinPresets';
import { formatDate } from './lawBits';
import { ResizeEdges } from './ResizeEdges';
import { ResultRow } from './ResultRow';
import { RECENT_LIMIT, entryPart, favoritesKey, hitKey, recentKey, useHitLookup, useStoredKeys } from './saved';
import { ServerChoice } from './ServerChoice';
import { SettingsView, type SettingsSection } from './SettingsView';
import { useStats } from './stats';
import { Avatar } from './ProfileView';
import { useAccount } from '../account/AccountContext';
import type { Laws } from './laws';
import { APP_VERSION } from './about';
import { WhatsNewView } from './WhatsNewView';
import { CHANGELOG, SEEN_VERSION_KEY, compareVersions, notesSince, type VersionNotes } from './whatsNew';
import { UpdateBanner } from './UpdateBanner';
import { DISMISSED_KEY, TOASTED_KEY, useUpdates } from './updates';

/** Put off with «Позже», the notice that signing in will be required is not shown again. */
const LOGIN_NOTICE_KEY = 'login.notice';

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

/**
 * Timings of the push-to-talk key, in milliseconds: a «pressed» sooner than `repeat` after the last event is the key
 * repeating while held; a hold ends `holdEnd` after the repeats stop; a «let go» sooner than `tap` after the start is
 * a tap; a recording shorter than `shortest` holds no question.
 */
export const TALK = { repeat: 250, holdEnd: 450, tap: 700, shortest: 800 };

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
  capturing = false,
  laws,
  newUser = false,
  appearance,
}: {
  pack: ServerPack;
  profile: Profile;
  /** The theme and the accent, changed in the settings. */
  appearance?: AppearanceControl;
  /** Opens the first-launch steps again: server, organisation and hotkey in a row. */
  onEditProfile: () => void;
  /** Saves a changed profile — the server, the organisation or the hotkey, changed in the settings. */
  onProfile: (next: Profile) => void;
  /** While a hotkey is being recorded no global hotkey may be registered. */
  onCapturing: (capturing: boolean) => void;
  /** A hotkey is being recorded in the settings: no global hotkey may be registered meanwhile. */
  capturing?: boolean;
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
  /** The part of the settings the side column asked for: the account from the profile, what is pinned from the pin. */
  const [settingsFocus, setSettingsFocus] = useState<{ section: SettingsSection; at: number }>();
  const { status: accountStatus } = useAccount();
  const account = accountStatus.kind === 'signed-in' ? accountStatus.account : null;
  // Signing in becomes required with the next version: a player not signed in is told so on the home
  // screen until they sign in or put it off.
  const [loginNoticeOff, setLoginNoticeOff] = useState(true);
  useEffect(() => {
    void platform.readSetting<string>(LOGIN_NOTICE_KEY).then((saved) => setLoginNoticeOff(saved === 'later'));
  }, [platform]);
  const loginNotice = accountStatus.kind === 'signed-out' && !loginNoticeOff;
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

  // The AI analysis: while it is open, the search field takes the situation instead of a query.
  const [aiOpen, setAiOpen] = useState(false);
  const [aiDraft, setAiDraft] = useState('');
  const chat = useAiChat(platform, pack, organization);
  // The AI screen has two tabs: analysing a situation, and writing a document about it.
  const [aiTab, setAiTab] = useState<AiTab>('chat');
  const writer = useDocumentWriter(platform, pack, boostDocuments);
  const trainer = useTrainer(platform, pack, boostDocuments);
  const lawyer = useLawyerCheck(platform, pack, boostDocuments);
  /** The field is the AI's, not the search's: an article opened from the answer gives it back to the search. */
  const aiMode = aiOpen && !open;

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
        title: 'Вышло обновление Кремлёвского Ассистента',
        text: `Версия ${found}. Откройте ассистент (${formatHotkey(profile.hotkey)}) и нажмите «Обновить».`,
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
  /** The server and the organisation picked from the header, both on one screen. */
  const [switchOpen, setSwitchOpen] = useState(false);
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
      if (sections.length) setWhatsNew({ title: `Кремлёвский Ассистент обновлён до версии ${APP_VERSION}`, sections, backLabel: 'Закрыть' });
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
  // The home screen's banner: the latest update of the laws, until its changes have been on screen once.
  const latestChange = useMemo(() => recentChanges(pack, new Date(), CHANGED_DAYS)[0], [pack]);
  const bannerKey = `changes.banner:${pack.server.id}`;
  const [bannerSeen, setBannerSeen] = useState<string | null | undefined>(null);
  useEffect(() => {
    setBannerSeen(null);
    void platform.readSetting<string>(bannerKey).then(setBannerSeen);
  }, [platform, bannerKey]);
  useEffect(() => {
    if (!changesView || !latestChange || bannerSeen === latestChange.version) return;
    setBannerSeen(latestChange.version);
    void platform.writeSetting(bannerKey, latestChange.version);
  }, [changesView, latestChange, bannerSeen, platform, bannerKey]);
  const banner = latestChange && bannerSeen !== null && bannerSeen !== latestChange.version ? latestChange : undefined;

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
  // What the player does, for their profile and — unless turned off — the author's anonymous counts.
  const count = useStats(platform, pack.server.id);
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
    if (!inCalculator(hit)) {
      remember(hit);
      count({ kind: 'charge', article: key });
      if (charges.length === 0) count({ kind: 'calculation' });
    }
    setCharges((list) =>
      list.some((c) => c.key === key) ? list.filter((c) => c.key !== key) : [...list, { key, hit, stage: 'done', amount: '', days: '', unpaid: '' }],
    );
    searchRef.current?.focus();
  };
  /** Articles the AI found, into the calculator: the ones not in it yet, at the stage the AI saw. */
  const addCharges = (hits: (SearchHit & { stage?: Stage })[]) => {
    const fresh = hits.filter((hit) => addable(hit) && !inCalculator(hit));
    fresh.forEach(remember);
    setCharges((list) => [
      ...list,
      ...fresh.filter((hit) => !list.some((c) => c.key === hitKey(hit))).map((hit) => ({ key: hitKey(hit), hit, stage: hit.stage ?? 'done', amount: '', days: '', unpaid: '' })),
    ]);
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

  // A question over the game: hold the push-to-talk key and speak, let go — the AI's short answer is pinned over
  // the game as a card, and the overlay stays hidden. Notices over the game say what is going on meanwhile.
  const [voiceHotkey, setVoiceHotkey] = useState(DEFAULT_VOICE_HOTKEY);
  useEffect(() => {
    void platform.readSetting<string>(VOICE_HOTKEY_KEY).then((saved) => setVoiceHotkey(saved ?? DEFAULT_VOICE_HOTKEY));
  }, [platform]);
  const changeVoiceHotkey = (accelerator: string) => {
    setVoiceHotkey(accelerator);
    void platform.writeSetting(VOICE_HOTKEY_KEY, accelerator);
  };
  /**
   * Two ways to ask, told apart by what Windows reports of the key:
   * - held: a key held down repeats «pressed» every few dozen milliseconds (and may report «let go» between the
   *   repeats); the question ends a moment after the repeats stop — when the key is really let go;
   * - tapped: a press, then a pause, then another press ends the question.
   * A «let go» ends it only when the key is not repeating and was held a while: a quick one is the tap's own.
   */
  const talk = useRef({
    recording: null as Recording | null,
    startedAt: 0,
    lastEvent: 0,
    held: false,
    toldTap: false,
    holdTimer: undefined as ReturnType<typeof setTimeout> | undefined,
    starting: false,
    thinking: false,
  });
  const notice = (title: string, text?: string) => void platform.showToast({ id: `talk-${Date.now()}`, title, ...(text ? { text } : {}) });
  /** The first spoken question fetches the speech model: the wait is said, once. */
  const downloadingSpeech = () => notice('Скачиваю распознавание речи', 'Один раз, около 45 МБ. Дальше голос распознаётся прямо на компьютере.');
  const talkDown = useRef(async () => {});
  const talkUp = useRef(async () => {});
  const finishTalk = useRef(async () => {});
  talkDown.current = async () => {
    const state = talk.current;
    const now = Date.now();
    const gap = now - state.lastEvent;
    state.lastEvent = now;
    if (state.recording) {
      if (gap < TALK.repeat) {
        // The key repeats: it is being held. The question ends when the repeats stop.
        state.held = true;
        clearTimeout(state.holdTimer);
        state.holdTimer = setTimeout(() => void finishTalk.current(), TALK.holdEnd);
      } else {
        // A new press after a pause: the tapped question is over.
        await finishTalk.current();
      }
      return;
    }
    if (state.starting || state.thinking) return;
    if (!canRecord()) return notice('Микрофон недоступен', 'Спросить голосом не получится на этом компьютере.');
    state.starting = true;
    state.held = false;
    state.toldTap = false;
    try {
      state.recording = await startRecording(() => void finishTalk.current());
      state.startedAt = Date.now();
      notice('Слушаю…', `Говорите, пока держите ${formatHotkey(voiceHotkey)}. Или отпустите и нажмите ещё раз, когда договорите.`);
    } catch {
      notice('Не получилось включить микрофон', 'Windows: «Параметры» → «Конфиденциальность» → «Микрофон».');
    } finally {
      state.starting = false;
    }
  };
  talkUp.current = async () => {
    const state = talk.current;
    state.lastEvent = Date.now();
    // Held and repeating: the repeats stopping ends it, not a «let go» that may come between them.
    if (!state.recording || state.held) return;
    if (Date.now() - state.startedAt < TALK.tap) {
      // Let go at once: a tap — the recording goes on until the next press.
      if (!state.toldTap) notice('Слушаю…', `Скажите вопрос и нажмите ${formatHotkey(voiceHotkey)} ещё раз.`);
      state.toldTap = true;
      return;
    }
    await finishTalk.current();
  };
  finishTalk.current = async () => {
    const state = talk.current;
    clearTimeout(state.holdTimer);
    const recording = state.recording;
    if (!recording) return;
    state.recording = null;
    state.held = false;
    if (Date.now() - state.startedAt < TALK.shortest) {
      recording.cancel();
      return notice('Слишком коротко', `Держите ${formatHotkey(voiceHotkey)} всё время, пока говорите, — или нажмите, скажите и нажмите ещё раз.`);
    }
    state.thinking = true;
    try {
      notice('Думаю…');
      const question = await transcribe(platform, await recording.stop(), downloadingSpeech);
      if (!question) return notice('Не расслышал вопрос', 'Говорите чуть громче или ближе к микрофону.');
      const answer = await chat.send(question, undefined, { brief: true });
      if (!answer) return notice('ИИ ещё отвечает на прошлый вопрос');
      if (answer.failed) return notice('ИИ не ответил', answer.text);
      setGroups((list) => pinCard(list, aiPinCard(answer.id, question, answer.analysis ? cardText(answer.analysis) : answer.text), surface()));
    } catch (error) {
      notice('ИИ не ответил', error instanceof Error ? error.message : String(error));
    } finally {
      state.thinking = false;
    }
  };
  // Registered while no hotkey is being recorded in the settings, and never on the overlay's own key.
  useEffect(() => {
    if (capturing || !voiceHotkey || voiceHotkey === profile.hotkey) return;
    void platform.registerVoiceHotkey(
      voiceHotkey,
      () => void talkDown.current(),
      () => void talkUp.current(),
    );
    return () => void platform.unregisterVoiceHotkey();
  }, [platform, voiceHotkey, capturing, profile.hotkey]);
  useEffect(() => () => talk.current.recording?.cancel(), []);

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
    // In the AI analysis Enter sends the situation; the list keys have no list to walk.
    if (aiMode) {
      if (e.key === 'Enter' && !e.shiftKey && aiDraft.trim() && !(aiTab === 'document' ? writer.busy : aiTab === 'trainer' ? trainer.phase !== 'answering' : aiTab === 'lawyer' ? lawyer.busy : chat.busy)) {
        e.preventDefault();
        if (aiTab === 'document') void writer.write(aiDraft);
        else if (aiTab === 'trainer') void trainer.reply(aiDraft);
        else if (aiTab === 'lawyer') void lawyer.check(aiDraft);
        else void chat.send(aiDraft);
        setAiDraft('');
      }
      return;
    }
    // «Что изменилось» and «было → стало» are read with the mouse; the list keys would move a hidden selection.
    if (whatsNew || settingsOpen || switchOpen || organizationOpen || serverOpen || notesFor || privacyOpen || diff || (changesView && !open)) return;
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

  // A spoken question: the microphone until pressed again, then Gemini writes it down and the AI takes it up.
  const [voice, setVoice] = useState<'idle' | 'recording' | 'transcribing'>('idle');
  const recording = useRef<Recording | null>(null);
  useEffect(() => () => recording.current?.cancel(), []);
  const voiceFailed = (text: string) => {
    openAi();
    chat.note(text);
  };
  const stopVoice = async () => {
    const current = recording.current;
    if (!current) return;
    recording.current = null;
    setVoice('transcribing');
    try {
      const text = await transcribe(platform, await current.stop(), downloadingSpeech);
      if (text && aiOpen && aiTab === 'document') void writer.write(text);
      else if (text && aiOpen && aiTab === 'trainer') void trainer.reply(text);
      else if (text && aiOpen && aiTab === 'lawyer') void lawyer.check(text);
      else if (text) openAi(text);
      else voiceFailed('Не расслышал вопрос. Нажмите 🎤 и говорите чуть громче или ближе к микрофону.');
    } catch (error) {
      voiceFailed(error instanceof Error ? error.message : String(error));
    } finally {
      setVoice('idle');
    }
  };
  const toggleVoice = async () => {
    if (voice === 'recording') return void stopVoice();
    if (voice !== 'idle') return;
    try {
      recording.current = await startRecording(() => void stopVoice());
      setVoice('recording');
    } catch {
      voiceFailed(
        'Не получилось включить микрофон. Проверьте, что он подключён и что Windows разрешает к нему доступ: «Параметры» → «Конфиденциальность» → «Микрофон».',
      );
    }
  };

  // Earlier conversations with the AI, from the header.
  const [historyOpen, setHistoryOpen] = useState(false);

  /** Opens the AI analysis over whatever was on show; with a text — what was typed in the search — asks about it at once. */
  const openAi = (text?: string) => {
    setAiOpen(true);
    setHistoryOpen(false);
    setSwitchOpen(false);
    setOpen(null);
    setMenuOpen(false);
    setSettingsOpen(false);
    setChangesView(null);
    setDiff(null);
    setPrivacyOpen(false);
    setWhatsNew(null);
    if (text?.trim()) {
      void chat.send(text);
      setQuery('');
    }
    searchRef.current?.focus();
  };

  /** Esc steps back one layer at a time: a screen over the settings → the settings → menu → article →
   * search text → document → hide the overlay. */
  const stepBack = useRef<() => void>(() => {});
  stepBack.current = () => {
    if (menuOpen) setMenuOpen(false);
    else if (whatsNew) setWhatsNew(null);
    else if (switchOpen) setSwitchOpen(false);
    else if (organizationOpen) setOrganizationOpen(false);
    else if (serverOpen) setServerOpen(false);
    else if (notesFor) setNotesOpen(false);
    else if (privacyOpen) setPrivacyOpen(false);
    else if (diff) setDiff(null);
    else if (changesView && settingsOpen) setChangesView(null);
    else if (settingsOpen) setSettingsOpen(false);
    else if (open) setOpen(null);
    else if (historyOpen) setHistoryOpen(false);
    else if (aiOpen) setAiOpen(false);
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
    count({ kind: 'open', article: hitKey(hit) });
    searchRef.current?.focus();
  };
  // Back from an article (or any screen over the list) the list is where it was left, not at its top;
  // what is opened starts at its own top.
  const contentRef = useRef<HTMLDivElement>(null);
  const listScroll = useRef(0);
  /** The side menu's sections: each closes what is on screen and opens its own. */
  const openSection = (section: 'search' | 'documents' | 'switch' | 'pinned' | 'settings' | 'profile') => {
    setWhatsNew(null);
    setOrganizationOpen(false);
    setServerOpen(false);
    setPrivacyOpen(false);
    setDiff(null);
    setAiOpen(false);
    setHistoryOpen(false);
    setMenuOpen(section === 'documents');
    setSwitchOpen(section === 'switch');
    setSettingsOpen(section === 'pinned' || section === 'settings' || section === 'profile');
    // The profile is the account at the top of the settings; the pin, what is pinned in them.
    setSettingsFocus(section === 'profile' ? { section: 'account', at: Date.now() } : section === 'pinned' ? { section: 'pinned', at: Date.now() } : undefined);
    searchRef.current?.focus();
  };

  /** The settings are a page of their own (direction C): their name in the header, no search. */
  const inner = settingsOpen ? 'Настройки' : null;
  // Back from them the search is there again, with the focus.
  useEffect(() => {
    if (!inner) searchRef.current?.focus();
  }, [inner]);

  const onList = !whatsNew && !settingsOpen && !switchOpen && !organizationOpen && !serverOpen && !notesFor && !privacyOpen && !diff && !open && !changesView && !aiOpen && !historyOpen;
  const wasOnList = useRef(onList);
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (content && onList !== wasOnList.current) content.scrollTop = onList ? listScroll.current : 0;
    wasOnList.current = onList;
  }, [onList]);

  /** The article's part as a hit of its own, for the calculator. */
  const partHit = (hit: SearchHit, part?: Part): SearchHit => ({ article: hit.article, document: hit.document, part: part ?? entryPart(hit.article) });
  const rowFor = (hit: SearchHit, i: number, inChapter = false, tile = false) => (
    <div role="listitem" key={hitKey(hit)}>
      <ResultRow
        hit={hit}
        selected={i === current}
        inChapter={inChapter}
        tile={tile}
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
      <SideRail
        top={
          <button className="rail__server" type="button" title="Сервер и организация" aria-label="Сменить сервер или организацию" onClick={() => openSection(switchOpen ? 'search' : 'switch')}>
            <ServerIcon id={pack.server.id} size={24} />
          </button>
        }
        current={settingsOpen ? 'settings' : menuOpen ? 'documents' : switchOpen ? undefined : historyOpen ? 'history' : aiOpen ? 'ai' : 'search'}
        items={[
          { id: 'search', label: 'Поиск', icon: <SearchIcon />, shortcut: 1, onSelect: () => openSection('search') },
          {
            id: 'documents',
            label: 'Документы',
            ariaLabel: 'Все документы',
            expanded: menuOpen,
            icon: <DocumentsIcon />,
            shortcut: 2,
            onSelect: () => openSection(menuOpen ? 'search' : 'documents'),
          },
          {
            id: 'calculator',
            label: 'Калькулятор',
            icon: <CalculatorIcon />,
            shortcut: 3,
            disabled: !calculatorOpen,
            hint: calculatorOpen ? undefined : 'Калькулятор появится, когда вы добавите статью кнопкой «+»',
            onSelect: () => document.querySelector<HTMLElement>('.calc button, .calc input')?.focus(),
          },
          { id: 'pinned', label: 'Закреплённое', icon: <PinIcon />, shortcut: 4, onSelect: () => openSection('pinned') },
          {
            id: 'ai',
            label: 'ИИ',
            ariaLabel: 'ИИ-разбор ситуации',
            icon: <SparkIcon />,
            shortcut: 7,
            onSelect: () => (aiOpen && !historyOpen ? openSection('search') : openAi()),
          },
          {
            id: 'history',
            label: 'История',
            ariaLabel: 'История ИИ-разборов',
            icon: <HistoryIcon />,
            onSelect: () => {
              const show = !historyOpen;
              openSection('search');
              setHistoryOpen(show);
            },
          },
          { id: 'memos', label: 'Памятки', icon: <MemoIcon />, disabled: true, hint: 'Памятки фракции — скоро', onSelect: () => {} },
          {
            id: 'settings',
            label: 'Настройки',
            expanded: settingsOpen,
            icon: <SettingsIcon />,
            shortcut: 5,
            bottom: true,
            onSelect: () => openSection(settingsOpen ? 'search' : 'settings'),
          },
          {
            id: 'profile',
            label: 'Профиль',
            ariaLabel: account ? `Профиль: ${account.name}` : undefined,
            icon: account ? <Avatar account={account} size={26} /> : <ProfileIcon />,
            shortcut: 6,
            bottom: true,
            onSelect: () => openSection('profile'),
          },
        ]}
      />
      <div className="overlay__main">
      <div className="overlay__head" data-tauri-drag-region>
        <span className="brand" data-tauri-drag-region>
          {inner ?? pack.server.name}
        </span>
        {!inner && (
        <button
          className={switchOpen ? 'chip chip--switch chip--on' : 'chip chip--switch'}
          type="button"
          aria-label="Сервер и организация"
          aria-expanded={switchOpen}
          title={summary}
          onClick={() => openSection(switchOpen ? 'search' : 'switch')}
        >
          <OrganizationIcon id={organization?.id ?? 'none'} size={16} />
          <span>{organization && organization.id !== 'none' ? organization.name : 'Без организации'}</span>
          <ChevronDownIcon size={16} />
        </button>
        )}
        <span className="sp" data-tauri-drag-region />
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

      {switchOpen && (
        <>
          {/* Clicked beside it, the switcher closes. */}
          <div
            className="switch-pop__backdrop"
            onClick={() => {
              setSwitchOpen(false);
              searchRef.current?.focus();
            }}
          />
          <section className="switch-pop" aria-label="Сервер и организация">
            <h3 className="switch-pop__title">Сервер</h3>
            <ServerChoice
              compact
              value={profile.server}
              onPick={(id) => {
                // It stays open: the organisation is picked next, from the new server's own.
                const keep = packFor(id).organizations.some((o) => o.id === profile.organization);
                onProfile({ ...profile, server: id, organization: keep ? profile.organization : 'none' });
              }}
            />
            <h3 className="switch-pop__title">Фракция</h3>
            <OrganizationChoice
              compact
              pack={pack}
              value={profile.organization}
              onPick={(id) => {
                onProfile({ ...profile, organization: id });
                setSwitchOpen(false);
                searchRef.current?.focus();
              }}
            />
          </section>
        </>
      )}

      <UpdateBanner
        updates={updates}
        onNotes={() => {
          setSettingsOpen(false);
          setNotesOpen(true);
        }}
      />

      {!inner && (
      <div className={aiMode ? 'search search--ai' : 'search'}>
        {aiMode ? <SparkIcon /> : <SearchIcon />}
        {scope && !aiMode && (
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
          placeholder={
            aiMode
              ? aiTab === 'document'
                ? 'Опишите, что произошло: кто, где, что сделал…'
                : aiTab === 'trainer'
                  ? 'Ваш ответ своими словами…'
                  : aiTab === 'lawyer'
                    ? 'Что требует адвокат: свидание, копию протокола…'
                    : chat.messages.length
                      ? 'Уточните или опишите новую ситуацию…'
                      : 'Опишите ситуацию своими словами…'
              : scope
                ? `Поиск: ${scope.title}`
                : 'Номер или слова: 65, коап 8.6, кража'
          }
          autoComplete="off"
          spellCheck={aiMode}
          value={aiMode ? aiDraft : query}
          onChange={(e) => {
            if (aiMode) {
              setAiDraft(e.target.value);
              setSettingsOpen(false);
              setPrivacyOpen(false);
              return;
            }
            if (!query.trim() && e.target.value.trim()) count({ kind: 'search' });
            setQuery(e.target.value);
            setAiOpen(false);
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
        {canRecord() && (
          <button
            type="button"
            className={voice === 'idle' ? 'mic' : `mic mic--${voice}`}
            aria-label={voice === 'recording' ? 'Остановить запись и спросить ИИ' : 'Спросить ИИ голосом'}
            aria-pressed={voice === 'recording'}
            title={voice === 'recording' ? 'Говорите… нажмите ещё раз, чтобы спросить' : voice === 'transcribing' ? 'Разбираю, что вы сказали…' : 'Спросить голосом'}
            disabled={voice === 'transcribing'}
            onClick={() => void toggleVoice()}
          >
            <MicIcon />
          </button>
        )}
        <span className="kbd">{aiMode ? 'Enter' : 'Esc'}</span>
      </div>
      )}

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
            pack={pack}
            organization={organization}
            onServer={() => setServerOpen(true)}
            onOrganization={() => setOrganizationOpen(true)}
            onEditProfile={onEditProfile}
            hotkey={profile.hotkey}
            onHotkey={(accelerator) => onProfile({ ...profile, hotkey: accelerator })}
            onCapturing={onCapturing}
            voiceHotkey={voiceHotkey}
            onVoiceHotkey={changeVoiceHotkey}
            opacity={opacity}
            onOpacity={changeOpacity}
            appearance={appearance}
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
            focus={settingsFocus}
          />
        ) : open ? (
          <ArticleView
            article={open.article}
            document={open.document}
            focusPart={open.part}
            backLabel={aiOpen ? 'ИИ-разбор' : changesView ? 'Что изменилось' : home ? 'Избранное и недавние' : view === 'contents' ? 'Оглавление' : 'Результаты'}
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
        ) : historyOpen ? (
          <HistoryView
            history={chat.history}
            serverName={pack.server.name}
            backLabel={aiOpen ? 'ИИ-разбор' : 'Поиск'}
            onBack={() => {
              setHistoryOpen(false);
              searchRef.current?.focus();
            }}
            onOpen={(id) => {
              chat.open(id);
              setHistoryOpen(false);
              setAiOpen(true);
              searchRef.current?.focus();
            }}
            onForget={chat.forget}
          />
        ) : aiOpen && aiTab === 'lawyer' ? (
          <LawyerView
            lawyer={lawyer}
            backLabel={query ? 'Результаты' : scope ? 'Оглавление' : 'Поиск'}
            onBack={() => {
              setAiOpen(false);
              searchRef.current?.focus();
            }}
            onOpen={openHit}
            onTab={(tab) => {
              setAiTab(tab);
              searchRef.current?.focus();
            }}
          />
        ) : aiOpen && aiTab === 'trainer' ? (
          <TrainerView
            trainer={trainer}
            pack={pack}
            backLabel={query ? 'Результаты' : scope ? 'Оглавление' : 'Поиск'}
            onBack={() => {
              setAiOpen(false);
              searchRef.current?.focus();
            }}
            onOpen={openHit}
            onTab={(tab) => {
              setAiTab(tab);
              searchRef.current?.focus();
            }}
          />
        ) : aiOpen && aiTab === 'document' ? (
          <DocumentView
            writer={writer}
            backLabel={query ? 'Результаты' : scope ? 'Оглавление' : 'Поиск'}
            onBack={() => {
              setAiOpen(false);
              searchRef.current?.focus();
            }}
            onOpen={openHit}
            onTab={(tab) => {
              setAiTab(tab);
              searchRef.current?.focus();
            }}
          />
        ) : aiOpen ? (
          <AiView
            chat={chat}
            backLabel={query ? 'Результаты' : scope ? 'Оглавление' : 'Поиск'}
            onBack={() => {
              setAiOpen(false);
              searchRef.current?.focus();
            }}
            onOpen={openHit}
            onSettings={() => setSettingsOpen(true)}
            calculable={calculable}
            onCharge={addCharges}
            onPinArticle={(hit) => setGroups((list) => (hasCard(list, hitKey(hit)) ? list : pinCard(list, articlePinCard(hit, rules), surface())))}
            onCopy={(text) => platform.writeClipboard(text)}
            onDraft={(text) => {
              setAiDraft(text);
              searchRef.current?.focus();
            }}
            onLink={(url) => void platform.openExternal(url)}
            onTab={(tab) => {
              setAiTab(tab);
              searchRef.current?.focus();
            }}
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
            {banner && (
              <button className="home__banner" type="button" onClick={showRecentChanges}>
                <span>
                  Законы обновлены <b>{formatDate(banner.version).slice(0, 5)}</b> —{' '}
                  {plural(banner.documents.length, ['документ изменился', 'документа изменились', 'документов изменились'])}
                </span>
                <span className="sp" />
                <b>Смотреть →</b>
              </button>
            )}
            {loginNotice && (
              <section className="home__notice" aria-label="Вход скоро станет обязательным">
                <span>
                  <b>Со следующего обновления ассистент попросит войти</b> через Discord или Telegram — это займёт минуту, а
                  настройки и избранное переедут в аккаунт. Интернет нужен только для самого входа.
                </span>
                <span className="home__notice-actions">
                  <button className="settings__button" type="button" onClick={() => openSection('profile')}>
                    Войти
                  </button>
                  <button
                    className="link-btn"
                    type="button"
                    onClick={() => {
                      setLoginNoticeOff(true);
                      void platform.writeSetting(LOGIN_NOTICE_KEY, 'later');
                      searchRef.current?.focus();
                    }}
                  >
                    Позже
                  </button>
                </span>
              </section>
            )}
            {favorites.length > 0 && (
              <>
                <div className="sec-t home__title">Избранное</div>
                <div className="list list--tiles" role="list" aria-label="Избранное">
                  {favorites.map((hit, i) => rowFor(hit, i, false, true))}
                </div>
              </>
            )}
            {recent.length > 0 && (
              <>
                <div className="home__head">
                  <div className="sec-t home__title">Недавние</div>
                  <button
                    type="button"
                    className="link-btn home__clear"
                    aria-label="Очистить недавние"
                    onClick={() => {
                      updateRecent(() => []);
                      setSelected(0);
                      searchRef.current?.focus();
                    }}
                  >
                    Очистить
                  </button>
                </div>
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
            {/* A situation typed into the search finds nothing whole: the AI takes it word by word. */}
            <button className="ai-offer" type="button" onClick={() => openAi(query)}>
              <SparkIcon size={18} />
              <span>
                Разобрать с ИИ: <b>«{query.trim()}»</b>
              </span>
            </button>
          </>
        )}
      </div>

      <div className="overlay__foot">
        {aiMode ? (
          <>
            <span>
              <b>Enter</b> {aiTab === 'document' ? 'составить документ' : aiTab === 'trainer' ? 'ответить' : aiTab === 'lawyer' ? 'проверить требования' : 'спросить ИИ'}
            </span>
            <span>клик по статье — открыть</span>
            <span>
              <b>Esc</b> к поиску
            </span>
          </>
        ) : (
          <>
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
          </>
        )}
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
    </div>
    </>
  );
}
