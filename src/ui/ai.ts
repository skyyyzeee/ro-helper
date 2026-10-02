// The AI in the app: which service to ask (from the settings), the conversation with its history, and speech.
// The legal pipeline itself — context, answer format, checks, calculator — is the protocol core (src/protocol).
import { useCallback, useEffect, useRef, useState } from 'react';
import { articleLabel, changedSince, snapshotOf, type Organization, type PackSnapshot, type ServerPack } from '../core';
import {
  AiError,
  answerQuestion,
  calculateCharges,
  labelSources,
  readAnswer,
  geminiProvider,
  lawTerms as findLawTerms,
  openaiProvider,
  serverProvider,
  validateAnswer,
  type AiProvider as AiService,
  type Analysis,
  type CaseState,
  type CustomAi,
  type Depth,
  type LegalAnswer,
  type Perspective,
  type QueryAlias,
  type ScopeChoice,
  type SystemReason,
  type Turn,
} from '../protocol';
import type { SearchHit } from '../core';
import { aiProfileOf, type AiProfile } from '../account/capabilities';
import type { PlatformAdapter } from '../platform/types';
import { loadAliases } from './feedback';
import { AI_SERVER } from './about';
import { recognize } from './localSpeech';
import { wavBase64, type RecordedAudio } from './voice';

export { AiError, SOURCES } from '../protocol';
export type { Perspective } from '../protocol';

/** The player's own Gemini key, in the settings file on this computer. */
export const AI_KEY_SETTING = 'ai.key';
export const AI_KEY_URL = 'https://aistudio.google.com/apikey';

export const PERSPECTIVES: { id: Perspective; label: string }[] = [
  { id: 'state', label: 'Государство' },
  { id: 'citizen', label: 'Гражданский' },
  { id: 'lawyer', label: 'Адвокат' },
  { id: 'crime', label: 'Крайм' },
];

/**
 * The sides a case may be seen from, by the player's profile: their own first, then the defence and the citizen's
 * rights — an officer's powers are for the state, the crime's view for the crime.
 */
const PROFILE_PERSPECTIVES: Record<AiProfile, Perspective[]> = {
  citizen: ['citizen', 'lawyer'],
  state: ['state', 'lawyer', 'citizen'],
  crime: ['crime', 'lawyer', 'citizen'],
};
export const perspectivesFor = (organization?: Organization): Perspective[] => PROFILE_PERSPECTIVES[aiProfileOf(organization)];

/** A message to the AI: text, or a file sent along with it — a voice recording. */
export type GeminiTurn = Turn;

// ——— Where the questions go ———

/**
 * The AI a player talks to: an AI server (server/ in the repository), which holds the key and needs nothing from
 * the player — or their own OpenAI-compatible service with their key (issue #2) — or Gemini with their own key,
 * for those it works for (it does not in Russia).
 */
export type AiProvider = 'server' | 'custom' | 'gemini';
export const AI_PROVIDER_SETTING = 'ai.provider';
/** The player's own service: `{ url, key, model }`, in the settings file on this computer only (not synced). */
export const AI_CUSTOM_SETTING = 'ai.custom';
export const NO_CUSTOM = 'Сначала укажите адрес и модель своего ИИ в настройках (⚙ → «ИИ»).';
/** Another AI server than the built-in one (`AI_SERVER`), to try one out; normally unset. */
export const AI_SERVER_SETTING = 'ai.server';
/**
 * A random id of this computer for the AI server's daily limits — its own, not the statistics' `device.id`, so the
 * AI server and the counts at Supabase cannot be tied together.
 */
export const DEVICE_SETTING = 'ai.device';

export type AiConnection =
  | { provider: 'server'; server: string; device: string }
  | ({ provider: 'custom' } & CustomAi)
  | { provider: 'gemini'; key: string };

/** The AI server's address: the built-in one, or another tried out in the settings. */
export const aiServerOf = async (platform: PlatformAdapter): Promise<string> => ((await platform.readSetting<string>(AI_SERVER_SETTING))?.trim() || AI_SERVER).replace(/\/$/, '');

/** This computer's random id for the AI server's daily limits, made on first need. */
export async function deviceOf(platform: PlatformAdapter): Promise<string> {
  let device = await platform.readSetting<string>(DEVICE_SETTING);
  if (!device) {
    device = `d${crypto.randomUUID().replace(/-/g, '')}`;
    await platform.writeSetting(DEVICE_SETTING, device);
  }
  return device;
}

/** How to reach the AI now, from the settings; a missing key or address is said at once. */
export async function connect(platform: PlatformAdapter): Promise<AiConnection> {
  const server = await aiServerOf(platform);
  const chosen = await platform.readSetting<AiProvider>(AI_PROVIDER_SETTING);
  if (chosen === 'custom') {
    const custom = await platform.readSetting<Partial<CustomAi>>(AI_CUSTOM_SETTING);
    const url = custom?.url?.trim() ?? '';
    const model = custom?.model?.trim() ?? '';
    if (!url || !model) throw new AiError(NO_CUSTOM, 'key');
    return { provider: 'custom', url, key: custom?.key?.trim() ?? '', model };
  }
  // With no AI server known, the player's own Gemini key is the only other way.
  const provider = server ? (chosen ?? 'server') : 'gemini';
  if (provider === 'gemini') {
    const key = (await platform.readSetting<string>(AI_KEY_SETTING))?.trim();
    if (!key) throw new AiError(NO_KEY, 'key');
    return { provider, key };
  }
  return { provider: 'server', server, device: await deviceOf(platform) };
}

/** The service behind a connection. */
export const serviceFor = (connection: AiConnection): AiService =>
  connection.provider === 'server'
    ? serverProvider(connection.server, connection.device)
    : connection.provider === 'custom'
      ? openaiProvider(connection)
      : geminiProvider(connection.key);

/**
 * Asks the AI. Through the AI server, `counts` says whether this is a question of the player's daily
 * limit or only a step of one (the law terms, the trainer's questions); `think` lets the model reason longer.
 */
export function ask(connection: AiConnection, system: string, contents: Turn[], json = false, counts = true, think = false): Promise<string> {
  return serviceFor(connection).complete({ system, turns: contents, json, counts, think });
}

/** The situation in the words of the law, for the search; nothing when the AI could not say. */
export const lawTerms = (connection: AiConnection, situation: string) => findLawTerms(serviceFor(connection), situation);

export interface AiMessage {
  id: number;
  role: 'user' | 'ai';
  text: string;
  perspective?: Perspective;
  /** The analysis: its blocks, the articles it stood on, the checks and the calculator's count. */
  analysis?: Analysis;
  /** The AI could not answer: the text says why. */
  failed?: boolean;
  pending?: boolean;
  /**
   * The app answered itself, with no AI: a greeting, something outside the base, an article number (with what the
   * search found), or «закон или правила?» (with the choices and the question to ask again).
   */
  system?: { reason: SystemReason; hits?: SearchHit[]; options?: { label: string; choice: ScopeChoice }[]; question?: string };
  /** What the classifier took the question for, and why — for the admin's debug view; not kept in the history. */
  classification?: { type: string; why: string };
}

export interface SendOptions {
  /** A few short lines for a card over the game: always the quick analysis. */
  brief?: boolean;
  /** The laws or the rules for this one question (an answer to «закон или правила?»), whatever the switch says. */
  choice?: ScopeChoice;
  /** The depth of this one answer: «Подробнее» asks the full analysis of the same case. */
  depth?: Depth;
}

export interface AiChat {
  messages: AiMessage[];
  busy: boolean;
  /** Quick (article → punishment) or full (facts → norms → alternatives → procedure). */
  depth: Depth;
  setDepth: (depth: Depth) => void;
  /** Which documents answer: the app decides (auto), the laws, or the rules of the server. */
  choice: ScopeChoice;
  setChoice: (choice: ScopeChoice) => void;
  /** The case so far: its facts, assumptions and articles; null before the first answer. */
  current: CaseState | null;
  /** The sides the player's profile may see a case from. */
  perspectives: Perspective[];
  /** Asks; resolves with the answer, or a failed one saying why — or nothing while another question is on its way. */
  send: (text: string, perspective?: Perspective, options?: SendOptions) => Promise<AiMessage | undefined>;
  /** A new conversation; the one on show stays in the history. */
  clear: () => void;
  /** A notice from the app itself, shown as a failed answer. */
  note: (text: string) => void;
  /** Earlier conversations on this server, newest first. */
  history: StoredConversation[];
  open: (id: string) => void;
  /** Forgets one conversation, or all of them without an id. */
  forget: (id?: string) => void;
  /** The case on show. */
  caseId: string;
  /** What of the case on show reads differently in the laws now; null when nothing, or not known. */
  changes: { changed: string[]; gone: string[] } | null;
  /** Checks the case on show against the laws of the day. */
  recheck: () => Promise<void>;
  rename: (id: string, title: string) => void;
  pin: (id: string, pinned: boolean) => void;
  archive: (id: string, archived: boolean) => void;
  duplicate: (id: string) => void;
}

export const DEPTH_SETTING = 'ai.depth';
/** The player's choice of laws, rules or auto, kept for the next time. */
export const SCOPE_SETTING = 'ai.scope';

/** The case the latest analysis left, if any. */
const caseOf = (messages: AiMessage[]): CaseState | undefined =>
  [...messages].reverse().find((m) => m.analysis && !m.analysis.answer.reply)?.analysis?.case;

/** The conversation with the AI, kept while the overlay lives: going to an article and back keeps it. */
export function useAiChat(platform: PlatformAdapter, pack: ServerPack, organization?: Organization): AiChat {
  const [messages, setMessages] = useState<AiMessage[]>([]);
  // The players' expressions the admins approved (docs/AI_DATASET.md): read once, before the first question.
  const aliases = useRef<Promise<QueryAlias[]> | null>(null);
  const [busy, setBusy] = useState(false);
  const [depth, setDepthState] = useState<Depth>('quick');
  const [choice, setChoiceState] = useState<ScopeChoice>('auto');
  const nextId = useRef(1);
  // The messages as last rendered, for a question asked from an event: read there, never while rendering.
  const current = useRef(messages);
  useEffect(() => {
    current.current = messages;
  }, [messages]);

  useEffect(() => {
    void platform.readSetting<Depth>(DEPTH_SETTING).then((saved) => {
      if (saved) setDepthState(saved === 'full' ? 'full' : 'quick');
    });
  }, [platform]);
  useEffect(() => {
    void platform.readSetting<ScopeChoice>(SCOPE_SETTING).then((saved) => {
      if (saved === 'law' || saved === 'server_rule') setChoiceState(saved);
    });
  }, [platform]);
  const setChoice = useCallback(
    (next: ScopeChoice) => {
      setChoiceState(next);
      void platform.writeSetting(SCOPE_SETTING, next);
    },
    [platform],
  );
  const setDepth = useCallback(
    (next: Depth) => {
      setDepthState(next);
      void platform.writeSetting(DEPTH_SETTING, next);
    },
    [platform],
  );

  // Conversations of this server kept on the computer, newest first; the one on show has its id.
  const storeKey = historyKey(pack.server.id);
  const [history, setHistory] = useState<StoredConversation[]>([]);
  const conversation = useRef(newConversationId());
  const [changes, setChanges] = useState<{ changed: string[]; gone: string[] } | null>(null);
  /** Only what the player asked is saved: opening an old conversation does not make it the newest. */
  const changed = useRef(false);
  useEffect(() => {
    let active = true;
    void platform.readSetting<StoredConversation[]>(storeKey).then((saved) => {
      if (active) setHistory(Array.isArray(saved) ? saved : []);
    });
    return () => {
      active = false;
    };
  }, [platform, storeKey]);
  useEffect(() => {
    if (!changed.current || !messages.length || messages.some((m) => m.pending)) return;
    changed.current = false;
    const first = messages.find((m) => m.role === 'user');
    const stored = messages.map(storeMessage);
    const now = new Date().toISOString();
    setHistory((list) => {
      const before = list.find((c) => c.id === conversation.current);
      const snapshot = grownSnapshot(pack, before?.snapshot, caseArticles(stored));
      const saved: StoredConversation = {
        ...before,
        id: conversation.current,
        version: 2,
        created: before?.created ?? now,
        updated: now,
        title: before?.named ? before.title : (first?.text ?? '').slice(0, 120),
        messages: stored,
        // Asked in again, it is not in the archive any more.
        archived: false,
        ...(snapshot ? { snapshot } : {}),
      };
      const next = keptCases([saved, ...list.filter((c) => c.id !== saved.id)]);
      void platform.writeSetting(storeKey, next);
      return next;
    });
  }, [messages, platform, storeKey, pack]);

  const send = useCallback(
    async (text: string, wanted?: Perspective, options: SendOptions = {}): Promise<AiMessage | undefined> => {
      const question = text.trim();
      if (!question || busy) return undefined;
      // A side the profile may not take is not taken: the case is seen as it is.
      const perspective = wanted && perspectivesFor(organization).includes(wanted) ? wanted : undefined;
      const asked: AiMessage = { id: nextId.current++, role: 'user', text: question, perspective };
      const answerId = nextId.current++;
      // The case the last answer left: a follow-up changes it rather than telling the story again.
      const previous = caseOf(current.current);
      changed.current = true;
      setMessages((list) => [...list, asked, { id: answerId, role: 'ai', text: '', pending: true }]);
      setBusy(true);
      const finish = (patch: Partial<AiMessage>): AiMessage => {
        const done: AiMessage = { id: answerId, role: 'ai', text: '', ...patch, pending: false };
        setMessages((list) => list.map((m) => (m.id === answerId ? done : m)));
        return done;
      };
      try {
        const connection = await connect(platform);
        const side = PERSPECTIVES.find((p) => p.id === perspective)?.label;
        const outcome = await answerQuestion({
          aliases: () => (aliases.current ??= loadAliases(platform)),
          provider: serviceFor(connection),
          pack,
          organization,
          message: perspective && previous ? `Разбери это же дело с точки зрения: ${side}.` : question,
          previous,
          perspective,
          depth: options.brief ? 'quick' : (options.depth ?? depth),
          choice: options.choice ?? choice,
        });
        if (outcome.kind === 'system') {
          return finish({
            text: outcome.text,
            system: {
              reason: outcome.reason,
              ...(outcome.hits ? { hits: outcome.hits } : {}),
              ...(outcome.options ? { options: outcome.options, question } : {}),
            },
          });
        }
        return finish({ text: answerText(outcome.analysis.answer), analysis: outcome.analysis, perspective, classification: { type: outcome.classification.type, why: outcome.classification.why } });
      } catch (error) {
        return finish({ failed: true, text: error instanceof Error ? error.message : String(error) });
      } finally {
        setBusy(false);
      }
    },
    [busy, platform, pack, organization, depth, choice],
  );

  const clear = useCallback(() => {
    conversation.current = newConversationId();
    setMessages([]);
    setChanges(null);
  }, []);

  /** An earlier conversation back on screen, to read or to go on with. */
  const open = useCallback(
    (id: string) => {
      const saved = history.find((c) => c.id === id);
      if (!saved) return;
      conversation.current = saved.id;
      setMessages(saved.messages.map((m) => ({ ...restoreMessage(pack, m), id: nextId.current++ })));
      setChanges(caseChanges(pack, saved));
    },
    [history, pack],
  );

  /** Changes one case and keeps the list. */
  const change = useCallback(
    (id: string, patch: (saved: StoredConversation) => StoredConversation | null) => {
      setHistory((list) => {
        const next = keptCases(list.flatMap((c) => (c.id === id ? (patch(c) ?? []) : [c])));
        void platform.writeSetting(storeKey, next);
        return next;
      });
    },
    [platform, storeKey],
  );
  const rename = useCallback((id: string, title: string) => change(id, (c) => (title.trim() ? { ...c, title: title.trim().slice(0, 120), named: true } : c)), [change]);
  const pin = useCallback((id: string, pinned: boolean) => change(id, (c) => ({ ...c, pinned })), [change]);
  const archive = useCallback((id: string, archived: boolean) => change(id, (c) => ({ ...c, archived, ...(archived ? { pinned: false } : {}) })), [change]);
  /** A copy beside it, to try another turn of the same case. */
  const duplicate = useCallback(
    (id: string) => {
      setHistory((list) => {
        const saved = list.find((c) => c.id === id);
        if (!saved) return list;
        const now = new Date().toISOString();
        const copy: StoredConversation = { ...saved, id: newConversationId(), title: `${saved.title} (копия)`.slice(0, 120), named: true, pinned: false, archived: false, created: now, updated: now };
        const next = keptCases([copy, ...list]);
        void platform.writeSetting(storeKey, next);
        return next;
      });
    },
    [platform, storeKey],
  );

  /**
   * The case on show, checked against the laws of the day: asked again with what changed — the articles found now —
   * and, once answered, marked as checked by them.
   */
  const recheck = useCallback(async () => {
    const id = conversation.current;
    const done = await send('Проверь это дело по текущей базе: статьи могли измениться с тех пор.');
    if (!done?.analysis) return;
    setChanges(null);
    change(id, (c) => (c.snapshot ? { ...c, checked: snapshotOf(pack, Object.keys(c.snapshot.articles)) } : c));
  }, [send, change, pack]);

  const forget = useCallback(
    (id?: string) => {
      setHistory((list) => {
        const next = id ? list.filter((c) => c.id !== id) : [];
        void platform.writeSetting(storeKey, next);
        return next;
      });
      if (!id || id === conversation.current) {
        conversation.current = newConversationId();
        setMessages([]);
      }
    },
    [platform, storeKey],
  );

  /** A notice in the conversation from the app itself — the voice could not be recorded, say. */
  const note = useCallback((text: string) => {
    setMessages((list) => [...list, { id: nextId.current++, role: 'ai', text, failed: true }]);
  }, []);

  return {
    messages,
    busy,
    depth,
    setDepth,
    choice,
    setChoice,
    current: caseOf(messages) ?? null,
    perspectives: perspectivesFor(organization),
    send,
    clear,
    note,
    history,
    open,
    forget,
    caseId: conversation.current,
    changes,
    recheck,
    rename,
    pin,
    archive,
    duplicate,
  };
}

/** The analysis as plain lines: for the card over the game, copying, and the saved history. */
export function answerText(answer: LegalAnswer): string {
  if (answer.reply) return answer.reply;
  return [
    answer.situation && `Суть: ${answer.situation}`,
    answer.norms.length ? `Статьи: ${answer.norms.map((n) => n.ref + (n.part ? ` ч. ${n.part}` : '')).join(', ')}` : '',
    answer.punishment && `Наказание: ${answer.punishment.text}`,
    answer.procedure[0] && `Что делать: ${answer.procedure[0].text}`,
  ]
    .filter(Boolean)
    .join('\n');
}

// ——— The history of conversations ———

/** Conversations with the AI, per server, kept in the settings on this computer. */
export const historyKey = (server: string) => `ai.history:${server}`;
const HISTORY_LIMIT = 30;

/**
 * A message as saved: the analysis as the AI gave it, and the articles it was shown by their ids — found again in
 * the laws when opened, and checked again against them, so an old answer is judged by today's laws.
 */
interface StoredMessage {
  role: 'user' | 'ai';
  text: string;
  perspective?: Perspective;
  failed?: boolean;
  answer?: LegalAnswer;
  sources?: { id?: string; document: string; article: string; part?: string }[];
  case?: CaseState;
}

/**
 * A case (ADR 0003): a saved conversation with its name, pin, archive and the laws it was worked out by. One
 * record, one store — a conversation from before reads as a case whose laws of then are not known.
 */
export interface StoredConversation {
  id: string;
  /** When it was last asked in (ISO). */
  updated: string;
  /** Its first question, or the name the player gave it. */
  title: string;
  messages: StoredMessage[];
  /** The record's format: 2 — a case. A conversation saved before has none. */
  version?: 2;
  /** When it was started (ISO). */
  created?: string;
  /** The player named it: the first question no longer names it. */
  named?: boolean;
  pinned?: boolean;
  archived?: boolean;
  /** The laws it was worked out by: each of its articles as it read when it entered the case. */
  snapshot?: PackSnapshot;
  /** Its last check against the laws of the day: those articles as they read then. */
  checked?: PackSnapshot;
}

/** The articles a case stands on: every norm that passed, in any of its answers. */
const caseArticles = (messages: StoredMessage[]) => [...new Set(messages.flatMap((m) => m.case?.articles ?? []))];

/** The snapshot grown by the articles new to the case, each as it reads now; those already in keep their print. */
function grownSnapshot(pack: ServerPack, snapshot: PackSnapshot | undefined, ids: string[]): PackSnapshot | undefined {
  const fresh = ids.filter((id) => !snapshot?.articles[id]);
  if (!fresh.length) return snapshot;
  const now = snapshotOf(pack, fresh);
  return snapshot ? { ...snapshot, articles: { ...snapshot.articles, ...now.articles } } : now;
}

/** What of a case's articles reads differently in the laws now, since it was made or last checked. */
export function caseChanges(pack: ServerPack, saved: StoredConversation): { changed: string[]; gone: string[] } | null {
  const by = saved.checked ?? saved.snapshot;
  if (!by) return null;
  const { changed, gone } = changedSince(pack, by);
  // Named as the player knows them: «УК ст. 65»; one the laws no longer have, by its id in the pack.
  const label = (id: string) => {
    for (const document of pack.documents) {
      const article = document.articles.find((a) => a.id === id);
      if (article) return `${document.short} ${articleLabel(article, undefined, document.unit)}`;
    }
    return id;
  };
  return changed.length || gone.length ? { changed: changed.map(label), gone: gone.map(label) } : null;
}

/** The cases kept: every pinned one, and the newest of the rest. */
const keptCases = (list: StoredConversation[]) => {
  let rest = 0;
  return list.filter((c) => c.pinned || ++rest <= HISTORY_LIMIT);
};

const newConversationId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function storeMessage(message: AiMessage): StoredMessage {
  const { role, text, perspective, failed, analysis } = message;
  return {
    role,
    text,
    ...(perspective ? { perspective } : {}),
    ...(failed ? { failed } : {}),
    ...(analysis
      ? {
          answer: analysis.answer,
          case: analysis.case,
          sources: analysis.sources.map(({ id, hit }) => ({
            id,
            document: hit.document.id,
            article: hit.article.id,
            ...(hit.part?.number ? { part: hit.part.number } : {}),
          })),
        }
      : {}),
  };
}

/** A saved message back as it was, its answer checked again against the laws as they are now. */
function restoreMessage(pack: ServerPack, message: StoredMessage): Omit<AiMessage, 'id'> {
  const restored: Omit<AiMessage, 'id'> = { role: message.role, text: message.text, perspective: message.perspective, failed: message.failed };
  if (!message.answer) return restored;
  // Under the ids the AI cited them by; an article the laws no longer have is missing, and the checks say so.
  // The type of each comes from the document, as it is in the laws now.
  const sources = (message.sources ?? []).flatMap(({ id, document, article, part }, i) => {
    const doc = pack.documents.find((d) => d.id === document);
    const found = doc?.articles.find((a) => a.id === article);
    if (!doc || !found) return [];
    const piece = part ? found.parts.find((p) => p.number === part) : undefined;
    const hit = { document: doc, article: found, ...(piece ? { part: piece } : {}) };
    return [{ ...labelSources([hit])[0], id: id ?? `S${i + 1}` }];
  });
  // Saved in either format: an answer from before statements carried sources is read as one.
  const answer = readAnswer(message.answer as unknown as Record<string, unknown>);
  const validation = validateAnswer(pack, sources, answer, message.case?.scope);
  return {
    ...restored,
    analysis: {
      answer,
      sources,
      validation,
      calculation: calculateCharges(pack, validation),
      scope: message.case?.scope ?? 'law',
      case: message.case ?? { facts: answer.facts, assumptions: answer.assumptions, norms: [], conclusion: answer.situation },
    },
  };
}

// ——— Voice ———

export const NO_KEY = 'Сначала вставьте ключ Gemini в настройках (⚙ → «ИИ-разбор»). Он бесплатный.';

const TRANSCRIBE_PROMPT =
  'На аудио игрок RP-сервера описывает ситуацию или задаёт вопрос. Запиши дословно, что сказано, по-русски, с нормальной пунктуацией. Ответь только этим текстом, без пояснений. Если речи не слышно — ответь пустой строкой.';

/**
 * Whisper, the speech model behind the server, learned from subtitled videos: on silence or noise it «hears» their
 * credits. Such a line is nothing heard, not a question.
 */
const PHANTOMS = /редактор субтитров|корректор [а-я]\.|субтитры (сделал|создавал|подогнал)|продолжение следует|спасибо за просмотр|подписывайтесь на канал/i;
export const heard = (text: string) => (PHANTOMS.test(text) ? '' : text);

/**
 * What was said in a recording, as text; empty when nothing was heard. Through the AI server the speech is
 * recognised on this computer (free, however many questions — `onDownload` says the model is being fetched the
 * first time), with the player's own service as well; with their own Gemini key, Gemini writes it down.
 */
export async function transcribe(platform: PlatformAdapter, audio: RecordedAudio, onDownload?: () => void): Promise<string> {
  const key = await connect(platform);
  // With the player's own service too: speech never goes to it, the speech model comes from the AI server.
  const models = key.provider === 'server' ? key.server : key.provider === 'custom' ? AI_SERVER : '';
  if (models) {
    try {
      return heard(await recognize(models, audio.chunks, audio.sampleRate, onDownload));
    } catch (error) {
      throw new AiError(`Не получилось распознать речь: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (key.provider !== 'gemini') throw new AiError('Голосом с вашим ИИ спросить не получится — напишите вопрос текстом.');
  const wav = wavBase64(audio);
  const text = await ask(key, TRANSCRIBE_PROMPT, [
    { role: 'user', parts: [{ inlineData: { mimeType: 'audio/wav', data: wav } }, { text: 'Запиши, что сказано.' }] },
  ]).catch((error: unknown) => {
    // Silence can come back as an empty answer: that is nothing heard, not a failure.
    if (error instanceof AiError && /пустой ответ/.test(error.message)) return '';
    throw error;
  });
  return text.trim().replace(/^["«]|["»]$/g, '');
}
