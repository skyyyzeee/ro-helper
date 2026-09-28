// Where a question goes: one interface over the AI services, so a model can be replaced without touching the
// analysis. Two exist — an AI server (server/ in the repository) (OpenAI-compatible, the key on the server) and Gemini with the player's key.

export interface Turn {
  role: 'user' | 'model';
  /** Text, or a file sent along with it — a voice recording. */
  parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[];
}

export interface AiRequest {
  system: string;
  turns: Turn[];
  /** Answer with a JSON value. */
  json?: boolean;
  /** Through the server: whether this is a question of the player's daily limit, or only a step of one. */
  counts?: boolean;
  /** The question needs reasoning, not just a lookup: the model may think longer. */
  think?: boolean;
}

export interface AiProvider {
  complete(request: AiRequest): Promise<string>;
}

/** What went wrong, so each case is told in its own words and the rest of the app goes on working. */
export type AiErrorKind = 'offline' | 'key' | 'busy' | 'limit' | 'timeout' | 'empty' | 'format' | 'failed';

export class AiError extends Error {
  constructor(
    message: string,
    readonly kind: AiErrorKind = 'failed',
  ) {
    super(message);
  }
  /** Worth asking the next model, or again in a moment. */
  get overloaded(): boolean {
    return this.kind === 'busy';
  }
}

/** A request that hangs is a failure the player is told about, not an endless «думаю…». */
async function post(url: string, init: RequestInit, seconds: number, offline: string): Promise<Response> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), seconds * 1000);
  try {
    return await fetch(url, { ...init, signal: abort.signal });
  } catch {
    if (abort.signal.aborted) throw new AiError('ИИ не ответил вовремя. Попробуйте ещё раз.', 'timeout');
    throw new AiError(offline, 'offline');
  } finally {
    clearTimeout(timer);
  }
}

/** The AI server: it holds the AI key, counts the daily limits and passes the question on. */
export function serverProvider(server: string, device: string): AiProvider {
  return {
    async complete({ system, turns, json = false, counts = true, think = false }) {
      const response = await post(
        `${server}/v1/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Device': device },
          body: JSON.stringify({ system, messages: asMessages(turns), json, counts, ...(think ? { think } : {}) }),
        },
        think ? 150 : 90,
        'Нет связи с сервером ИИ — проверьте интернет.',
      );
      const answer = (await response.json().catch(() => null)) as { text?: string; error?: string } | null;
      if (!response.ok || answer?.error) {
        const kind = response.status === 429 ? 'limit' : response.status >= 500 ? 'busy' : 'failed';
        throw new AiError(answer?.error ?? `Сервер ИИ не ответил (код ${response.status}).`, kind);
      }
      const text = answer?.text ?? '';
      if (!text.trim()) throw new AiError('ИИ прислал пустой ответ — попробуйте ещё раз.', 'empty');
      return text;
    },
  };
}

/** The turns as the server takes them: OpenAI's roles, text only. */
const asMessages = (turns: Turn[]) =>
  turns.map((turn) => ({
    role: turn.role === 'model' ? 'assistant' : 'user',
    content: turn.parts.map((part) => ('text' in part ? part.text : '')).join('\n'),
  }));

/** If the first model is overloaded, the next one is asked, without troubling the player. */
const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash'];
const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Gemini with the player's own key; the key goes in a header, never in the address. */
export function geminiProvider(key: string): AiProvider {
  const generate = async (model: string, { system, turns, json }: AiRequest): Promise<string> => {
    const response = await post(
      `${GEMINI_API}/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: turns,
          ...(json ? { generationConfig: { responseMimeType: 'application/json' } } : {}),
        }),
      },
      90,
      'Нет связи с Gemini — проверьте интернет.',
    );
    const body = (await response.json().catch(() => null)) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      error?: { message?: string };
    } | null;
    if (!response.ok || body?.error) {
      const message = body?.error?.message ?? `код ${response.status}`;
      if (/api key not valid|API_KEY_INVALID/i.test(message)) throw new AiError('Ключ Gemini не подходит. Проверьте его в настройках.', 'key');
      const busy = response.status === 503 || response.status === 429 || /overload|high demand|unavailable/i.test(message);
      throw new AiError(`Gemini вернул ошибку: ${message}`, busy ? 'busy' : 'failed');
    }
    const text = body?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
    if (!text.trim()) throw new AiError('Gemini прислал пустой ответ.', 'empty');
    return text;
  };
  return {
    async complete(request) {
      let last: unknown;
      for (const model of GEMINI_MODELS) {
        try {
          return await generate(model, request);
        } catch (error) {
          last = error;
          if (!(error instanceof AiError && error.overloaded)) throw error;
        }
      }
      throw new AiError(`Все модели Gemini сейчас перегружены. ${last instanceof Error ? last.message : ''}`.trim(), 'busy');
    },
  };
}
