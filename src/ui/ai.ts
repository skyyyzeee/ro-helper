// The AI analysis of a situation: Gemini reads only the articles the search found in the server's laws.
// It never sees the whole pack, so it cannot cite an article it was not given — that is the guard against
// made-up laws, not a request in the prompt alone.
import { useCallback, useEffect, useRef, useState } from 'react';
import { findForSituation, sourcesText, type SearchHit, type ServerPack } from '../core';
import type { PlatformAdapter } from '../platform/types';
import { AI_SERVER } from './about';
import { recognize } from './localSpeech';
import { wavBase64, type RecordedAudio } from './voice';

/** The player's own Gemini key, in the settings file on this computer. */
export const AI_KEY_SETTING = 'ai.key';
export const AI_KEY_URL = 'https://aistudio.google.com/apikey';

/** If the first model is overloaded, the next one is asked, without troubling the player. */
const MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash'];
const API = 'https://generativelanguage.googleapis.com/v1beta/models';
/** Articles given to the AI for one question. */
export const SOURCES = 14;
/** Earlier questions and answers sent along, so a follow-up («а если он в маске?») is understood. */
const HISTORY_TURNS = 6;

export type Perspective = 'state' | 'citizen' | 'lawyer' | 'crime';

export const PERSPECTIVES: { id: Perspective; label: string }[] = [
  { id: 'state', label: 'Государство' },
  { id: 'citizen', label: 'Гражданский' },
  { id: 'lawyer', label: 'Адвокат' },
  { id: 'crime', label: 'Крайм' },
];

const PERSPECTIVE_PROMPTS: Record<Perspective, string> = {
  state:
    'ПЕРСПЕКТИВА — ГОСУДАРСТВО (сотрудник МВД/госслужащий): какие у него полномочия и основания для действий; какой порядок процедуры; какие ограничения; что он обязан сделать; не превышает ли он полномочия.',
  citizen:
    'ПЕРСПЕКТИВА — ГРАЖДАНСКИЙ: какие у игрока права; что от него законно требуют; обязан ли он это выполнять; что он вправе проверить или оспорить; как корректно продолжить RP.',
  lawyer:
    'ПЕРСПЕКТИВА — АДВОКАТ: соблюдена ли законность процедуры; какие права доверителя затронуты; были ли основания у другой стороны; что проверить или потребовать; что можно обжаловать — только если это видно из источников, не выдумывай нарушений.',
  crime:
    'ПЕРСПЕКТИВА — КРАЙМ: какие риски у игрока-преступника; какие статьи к нему могут применить; какие RP-варианты у него дальше. Не поощряй и не оправдывай преступление — только правовые последствия по фактам.',
};

function systemPrompt(pack: ServerPack, perspective?: Perspective): string {
  return [
    `Ты — юридический ассистент для игрового RP-сервера Russia Online (GTA 5 RP), сервер «${pack.server.name}». У сервера своё вымышленное законодательство — оно НЕ совпадает с законами РФ.`,
    'ФОРМАТ ОТВЕТА на вопрос по законам или RP-ситуации:\nСуть: одна-две фразы — что происходит и главный вывод.\nСтатьи: каждая применимая статья отдельной строкой, начиная с «- », в точности как она подписана в источниках (например «- УК ст. 65 «Кража» — почему подходит»).\nДетали: 1–3 предложения, что это значит на практике, только по тексту источников.',
    'Если сообщение не вопрос по законам (приветствие, вопрос о тебе) — ответь коротко обычным текстом, без формата.',
    'СТРОГИЕ ПРАВИЛА:\n1. Используй только источники из сообщения игрока. Никогда не ссылайся на законы РФ (УК РФ, КоАП РФ и т.д.).\n2. Не придумывай статьи, части, санкции и номера, которых нет в источниках.\n3. Если среди источников нет ничего по делу — прямо напиши «В законах сервера по этой ситуации ничего не нашлось» и посоветуй, какими словами поискать.\n4. Если статья подходит лишь частично — так и скажи в «Деталях».\n5. Наказание называй только так, как оно записано в источнике.',
    perspective ? PERSPECTIVE_PROMPTS[perspective] : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** The answer goes on a small card over the game, read in the middle of an RP scene. */
const BRIEF =
  '\n\nОТВЕТ ДЛЯ КАРТОЧКИ ПОВЕРХ ИГРЫ: не больше 4 коротких строк — «Суть: …», «Статья: …» (с наказанием, если оно есть в источнике), «Что делать: …». Без вступлений и пояснений. Вопрос записан с голоса: если он обрывочный, непонятный или не о законах и правилах — ответь одной строкой «Не понял вопрос: …» с тем, что расслышал, и попроси спросить ещё раз. Не отвечай на то, чего не спрашивали.';

const TERMS_PROMPT =
  'Игрок описал ситуацию на RP-сервере своими словами. Перескажи её 4–8 короткими поисковыми фразами (2–4 слова) на языке законов: юридические термины, названия правонарушений, участники, предметы («незаконное ношение оружия», «сокрытие лица», «неповиновение сотруднику полиции»). Не называй номеров статей и названий законов. Ответь только JSON-массивом строк.';

export interface GeminiTurn {
  role: 'user' | 'model';
  /** Text, or a file sent along with it — a voice recording. */
  parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[];
}

export class AiError extends Error {
  constructor(
    message: string,
    readonly overloaded = false,
  ) {
    super(message);
  }
}

async function generate(key: string, model: string, system: string, contents: GeminiTurn[], json = false): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${API}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        ...(json ? { generationConfig: { responseMimeType: 'application/json' } } : {}),
      }),
    });
  } catch {
    throw new AiError('Нет связи с Gemini — проверьте интернет.');
  }
  const body = (await response.json().catch(() => null)) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    error?: { message?: string; status?: string };
  } | null;
  if (!response.ok || body?.error) {
    const message = body?.error?.message ?? `код ${response.status}`;
    const overloaded = response.status === 503 || response.status === 429 || /overload|high demand|unavailable/i.test(message);
    if (/api key not valid|API_KEY_INVALID/i.test(message)) throw new AiError('Ключ Gemini не подходит. Проверьте его в настройках.');
    throw new AiError(`Gemini вернул ошибку: ${message}`, overloaded);
  }
  const text = body?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
  if (!text.trim()) throw new AiError('Gemini прислал пустой ответ.');
  return text;
}

// ——— Where the questions go ———

/**
 * The AI a player talks to: an AI server (server/ in the repository), which holds the key and needs nothing from
 * the player — or Gemini with the player's own key, for those it works for (it does not in Russia).
 */
export type AiProvider = 'server' | 'gemini';
export const AI_PROVIDER_SETTING = 'ai.provider';
/** The AI server's address, when the app has none built in (`AI_SERVER`) or another is tried out. */
export const AI_SERVER_SETTING = 'ai.server';
/** A random id of this computer: the server's daily limits are counted by it. */
export const DEVICE_SETTING = 'device.id';

export type AiConnection = { provider: 'server'; server: string; device: string } | { provider: 'gemini'; key: string };

/** How to reach the AI now, from the settings; a missing Gemini key is said at once. */
export async function connect(platform: PlatformAdapter): Promise<AiConnection> {
  const server = ((await platform.readSetting<string>(AI_SERVER_SETTING))?.trim() || AI_SERVER).replace(/\/$/, '');
  // With no AI server known, the player's own Gemini key is the only way.
  const provider = server ? ((await platform.readSetting<AiProvider>(AI_PROVIDER_SETTING)) ?? 'server') : 'gemini';
  if (provider === 'gemini') {
    const key = (await platform.readSetting<string>(AI_KEY_SETTING))?.trim();
    if (!key) throw new AiError(NO_KEY);
    return { provider, key };
  }
  let device = await platform.readSetting<string>(DEVICE_SETTING);
  if (!device) {
    device = `d${crypto.randomUUID().replace(/-/g, '')}`;
    await platform.writeSetting(DEVICE_SETTING, device);
  }
  return { provider: 'server', server, device };
}

async function viaServer(connection: Extract<AiConnection, { provider: 'server' }>, path: string, body: unknown): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${connection.server}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device': connection.device },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AiError('Нет связи с сервером ИИ — проверьте интернет.');
  }
  const answer = (await response.json().catch(() => null)) as { text?: string; error?: string } | null;
  if (!response.ok || answer?.error) throw new AiError(answer?.error ?? `Сервер ИИ не ответил (код ${response.status}).`);
  return answer?.text ?? '';
}

/** The turns as the server takes them: OpenAI's roles, text only. */
const asMessages = (contents: GeminiTurn[]) =>
  contents.map((turn) => ({
    role: turn.role === 'model' ? 'assistant' : 'user',
    content: turn.parts.map((part) => ('text' in part ? part.text : '')).join('\n'),
  }));

/**
 * Asks the AI. Through the AI server, `counts` says whether this is a question of the player's daily
 * limit or only a step of one (the law terms, the trainer's questions); Gemini is asked model by model while
 * they are overloaded.
 */
/** `think`: the question needs reasoning, not just a lookup — the AI server lets the model think longer. */
export async function ask(connection: AiConnection, system: string, contents: GeminiTurn[], json = false, counts = true, think = false): Promise<string> {
  if (connection.provider === 'server') {
    const text = await viaServer(connection, '/v1/chat', { system, messages: asMessages(contents), json, counts, ...(think ? { think } : {}) });
    if (!text.trim()) throw new AiError('ИИ прислал пустой ответ — попробуйте ещё раз.');
    return text;
  }
  const key = connection.key;
  let last: unknown;
  for (const model of MODELS) {
    try {
      return await generate(key, model, system, contents, json);
    } catch (error) {
      last = error;
      if (!(error instanceof AiError && error.overloaded)) throw error;
    }
  }
  throw new AiError(`Все модели Gemini сейчас перегружены. ${last instanceof Error ? last.message : ''}`.trim());
}

/** The situation in the words of the law, for the search; nothing when the AI could not say. */
export async function lawTerms(connection: AiConnection, situation: string): Promise<string[]> {
  try {
    const text = await ask(connection, TERMS_PROMPT, [{ role: 'user', parts: [{ text: situation }] }], true, false);
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string').slice(0, 10) : [];
  } catch {
    // The search still has the situation's own words.
    return [];
  }
}

export interface AiMessage {
  id: number;
  role: 'user' | 'ai';
  text: string;
  perspective?: Perspective;
  /** What the answer stands on: the articles given to the AI. */
  sources?: SearchHit[];
  /** The AI could not answer: the text says why. */
  failed?: boolean;
  pending?: boolean;
}

export interface SendOptions {
  /** A few short lines for a card over the game, not a full analysis. */
  brief?: boolean;
}

export interface AiChat {
  messages: AiMessage[];
  busy: boolean;
  /** Asks about a situation, or the last one again from a side. */
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

/** The conversation with the AI, kept while the overlay lives: going to an article and back keeps it. */
export function useAiChat(platform: PlatformAdapter, pack: ServerPack, boostDocuments?: string[]): AiChat {
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const nextId = useRef(1);
  const current = useRef(messages);
  current.current = messages;

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
      const earlier = current.current.filter((m) => !m.pending && !m.failed);
      changed.current = true;
      setMessages((list) => [...list, asked, { id: answerId, role: 'ai', text: '', pending: true }]);
      setBusy(true);
      const finish = (patch: Partial<AiMessage>): AiMessage => {
        const done: AiMessage = { id: answerId, role: 'ai', text: '', ...patch, pending: false };
        setMessages((list) => list.map((m) => (m.id === answerId ? done : m)));
        return done;
      };
      try {
        const key = await connect(platform);
        // A follow-up leans on the question before it: both go into the search.
        const previous = [...earlier].reverse().find((m) => m.role === 'user')?.text ?? '';
        const context = perspective ? question : `${previous}\n${question}`.trim();
        const terms = await lawTerms(key, context);
        const sources = findForSituation(pack, context, { boostDocuments, lawTerms: terms, limit: SOURCES });
        const history: GeminiTurn[] = earlier.slice(-HISTORY_TURNS * 2).map((m) => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.text }],
        }));
        const prompt = sources.length
          ? `Вопрос игрока: ${question}\n\nНайденные в законах сервера источники (используй только их):\n\n${sourcesText(sources)}`
          : `Вопрос игрока: ${question}\n\nПоиск по законам сервера ничего не нашёл. Источников нет — скажи об этом честно, ничего не придумывай.`;
        const system = systemPrompt(pack, perspective) + (options.brief ? BRIEF : '');
        const answer = await ask(key, system, [...history, { role: 'user', parts: [{ text: prompt }] }]);
        return finish({ text: answer.trim(), sources, perspective });
      } catch (error) {
        return finish({ failed: true, text: error instanceof Error ? error.message : String(error) });
      } finally {
        setBusy(false);
      }
    },
    [busy, platform, pack, boostDocuments],
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

  return { messages, busy, send, clear, note, history, open, forget };
}

// ——— The history of conversations ———

/** Conversations with the AI, per server, kept in the settings on this computer. */
export const historyKey = (server: string) => `ai.history:${server}`;
const HISTORY_LIMIT = 30;

/** A message as saved: the articles it stood on by their ids, found again in the laws when opened. */
interface StoredMessage {
  role: 'user' | 'ai';
  text: string;
  perspective?: Perspective;
  failed?: boolean;
  sources?: { document: string; article: string }[];
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
  const { role, text, perspective, failed, sources } = message;
  return {
    role,
    text,
    ...(perspective ? { perspective } : {}),
    ...(failed ? { failed } : {}),
    ...(sources?.length ? { sources: sources.map((hit) => ({ document: hit.document.id, article: hit.article.id })) } : {}),
  };
}

/** A saved message back as it was; an article the laws no longer have is left out of its sources. */
function restoreMessage(pack: ServerPack, message: StoredMessage): Omit<AiMessage, 'id'> {
  const sources = message.sources?.flatMap(({ document, article }) => {
    const doc = pack.documents.find((d) => d.id === document);
    const found = doc?.articles.find((a) => a.id === article);
    return doc && found ? [{ document: doc, article: found }] : [];
  });
  return { role: message.role, text: message.text, perspective: message.perspective, failed: message.failed, sources };
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
