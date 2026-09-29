// The AI in the app: which service to ask (from the settings), the conversation with its history, and speech.
// The legal pipeline itself — context, answer format, checks, calculator — is the protocol core (src/protocol).
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Organization, ServerPack } from '../core';
import {
  AiError,
  analyse,
  calculateCharges,
  geminiProvider,
  lawTerms as findLawTerms,
  serverProvider,
  validateAnswer,
  type AiProvider as AiService,
  type Analysis,
  type CaseState,
  type Depth,
  type LegalAnswer,
  type Perspective,
  type Turn,
} from '../protocol';
import type { PlatformAdapter } from '../platform/types';
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

/** A message to the AI: text, or a file sent along with it — a voice recording. */
export type GeminiTurn = Turn;

// ——— Where the questions go ———

/**
 * The AI a player talks to: an AI server (server/ in the repository), which holds the key and needs nothing from
 * the player — or Gemini with the player's own key, for those it works for (it does not in Russia).
 */
export type AiProvider = 'server' | 'gemini';
export const AI_PROVIDER_SETTING = 'ai.provider';
/** Another AI server than the built-in one (`AI_SERVER`), to try one out; normally unset. */
export const AI_SERVER_SETTING = 'ai.server';
/**
 * A random id of this computer for the AI server's daily limits — its own, not the statistics' `device.id`, so the
 * AI server and the counts at Supabase cannot be tied together.
 */
export const DEVICE_SETTING = 'ai.device';

export type AiConnection = { provider: 'server'; server: string; device: string } | { provider: 'gemini'; key: string };

/** How to reach the AI now, from the settings; a missing Gemini key is said at once. */
export async function connect(platform: PlatformAdapter): Promise<AiConnection> {
  const server = ((await platform.readSetting<string>(AI_SERVER_SETTING))?.trim() || AI_SERVER).replace(/\/$/, '');
  // With no AI server known, the player's own Gemini key is the only way.
  const provider = server ? ((await platform.readSetting<AiProvider>(AI_PROVIDER_SETTING)) ?? 'server') : 'gemini';
  if (provider === 'gemini') {
    const key = (await platform.readSetting<string>(AI_KEY_SETTING))?.trim();
    if (!key) throw new AiError(NO_KEY, 'key');
    return { provider, key };
  }
  let device = await platform.readSetting<string>(DEVICE_SETTING);
  if (!device) {
    device = `d${crypto.randomUUID().replace(/-/g, '')}`;
    await platform.writeSetting(DEVICE_SETTING, device);
  }
  return { provider: 'server', server, device };
}

/** The service behind a connection. */
export const serviceFor = (connection: AiConnection): AiService =>
  connection.provider === 'server' ? serverProvider(connection.server, connection.device) : geminiProvider(connection.key);

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
}

export interface SendOptions {
  /** A few short lines for a card over the game: always the quick analysis. */
  brief?: boolean;
}

export interface AiChat {
  messages: AiMessage[];
  busy: boolean;
  /** Quick (article → punishment) or full (facts → norms → alternatives → procedure). */
  depth: Depth;
  setDepth: (depth: Depth) => void;
  /** The case so far: its facts, assumptions and articles; null before the first answer. */
  current: CaseState | null;
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
}

export const DEPTH_SETTING = 'ai.depth';

/** The case the latest analysis left, if any. */
const caseOf = (messages: AiMessage[]): CaseState | undefined =>
  [...messages].reverse().find((m) => m.analysis && !m.analysis.answer.reply)?.analysis?.case;

/** The conversation with the AI, kept while the overlay lives: going to an article and back keeps it. */
export function useAiChat(platform: PlatformAdapter, pack: ServerPack, organization?: Organization): AiChat {
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [depth, setDepthState] = useState<Depth>('quick');
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
    const saved: StoredConversation = {
      id: conversation.current,
      updated: new Date().toISOString(),
      title: (first?.text ?? '').slice(0, 120),
      messages: messages.map(storeMessage),
    };
    setHistory((list) => {
      const next = [saved, ...list.filter((c) => c.id !== saved.id)].slice(0, HISTORY_LIMIT);
      void platform.writeSetting(storeKey, next);
      return next;
    });
  }, [messages, platform, storeKey]);

  const send = useCallback(
    async (text: string, perspective?: Perspective, options: SendOptions = {}): Promise<AiMessage | undefined> => {
      const question = text.trim();
      if (!question || busy) return undefined;
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
        const analysis = await analyse({
          provider: serviceFor(connection),
          pack,
          organization,
          message: perspective && previous ? `Разбери это же дело с точки зрения: ${side}.` : question,
          previous,
          perspective,
          depth: options.brief ? 'quick' : depth,
        });
        return finish({ text: answerText(analysis.answer), analysis, perspective });
      } catch (error) {
        return finish({ failed: true, text: error instanceof Error ? error.message : String(error) });
      } finally {
        setBusy(false);
      }
    },
    [busy, platform, pack, organization, depth],
  );

  const clear = useCallback(() => {
    conversation.current = newConversationId();
    setMessages([]);
  }, []);

  /** An earlier conversation back on screen, to read or to go on with. */
  const open = useCallback(
    (id: string) => {
      const saved = history.find((c) => c.id === id);
      if (!saved) return;
      conversation.current = saved.id;
      setMessages(saved.messages.map((m) => ({ ...restoreMessage(pack, m), id: nextId.current++ })));
    },
    [history, pack],
  );

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

  return { messages, busy, depth, setDepth, current: caseOf(messages) ?? null, send, clear, note, history, open, forget };
}

/** The analysis as plain lines: for the card over the game, copying, and the saved history. */
export function answerText(answer: LegalAnswer): string {
  if (answer.reply) return answer.reply;
  return [
    answer.situation && `Суть: ${answer.situation}`,
    answer.norms.length ? `Статьи: ${answer.norms.map((n) => n.ref + (n.part ? ` ч. ${n.part}` : '')).join(', ')}` : '',
    answer.punishment && `Наказание: ${answer.punishment}`,
    answer.procedure[0] && `Что делать: ${answer.procedure[0]}`,
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

export interface StoredConversation {
  id: string;
  /** When it was last asked in (ISO). */
  updated: string;
  /** Its first question. */
  title: string;
  messages: StoredMessage[];
}

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
  const sources = (message.sources ?? []).flatMap(({ id, document, article, part }, i) => {
    const doc = pack.documents.find((d) => d.id === document);
    const found = doc?.articles.find((a) => a.id === article);
    if (!doc || !found) return [];
    const piece = part ? found.parts.find((p) => p.number === part) : undefined;
    return [{ id: id ?? `S${i + 1}`, hit: { document: doc, article: found, ...(piece ? { part: piece } : {}) } }];
  });
  const validation = validateAnswer(pack, sources, message.answer);
  return {
    ...restored,
    analysis: {
      answer: message.answer,
      sources,
      validation,
      calculation: calculateCharges(pack, validation),
      case: message.case ?? { facts: message.answer.facts, assumptions: message.answer.assumptions, norms: [], conclusion: message.answer.situation },
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
 * first time); with the player's own Gemini key, Gemini writes it down.
 */
export async function transcribe(platform: PlatformAdapter, audio: RecordedAudio, onDownload?: () => void): Promise<string> {
  const key = await connect(platform);
  if (key.provider === 'server') {
    try {
      return heard(await recognize(key.server, audio.chunks, audio.sampleRate, onDownload));
    } catch (error) {
      throw new AiError(`Не получилось распознать речь: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
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
