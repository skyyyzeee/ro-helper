// The AI server of Кремлёвский Ассистент: the app asks the AI through it, so players need no key of their own. The AI key lives only
// here, in the environment of this server (see env.example) — never in the app, which anyone can take apart.
//
// It asks GigaChat (Sber's free tier) first when its key is set, and any OpenAI-compatible API (ProxyAPI, VseGPT…)
// when GigaChat refuses, is busy or has used up its free tokens — so the paid API pays only for what GigaChat does
// not answer. It keeps the spending in check: a few questions a day per computer and per address, and a daily
// budget in rubles for everyone together.
// Plain Node (20+), no packages: `node server.mjs`, behind Caddy for HTTPS (see README.md).
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';

const env = (name, fallback) => process.env[name] ?? fallback;
const num = (name, fallback) => Number(env(name, fallback));

const CONFIG = {
  port: num('PORT', 8787),
  /** The OpenAI-compatible API and its key: ProxyAPI, VseGPT or another. */
  apiBase: env('AI_BASE_URL', 'https://api.proxyapi.ru/openai/v1').replace(/\/$/, ''),
  apiKey: env('AI_API_KEY', ''),
  /**
   * Models to ask, in turn: when one is busy (429 — the provider's limit for that model is taken up), the next
   * is tried. The first is AI_MODEL; AI_MODELS, comma-separated, replaces the whole list.
   */
  models: env('AI_MODELS', `${env('AI_MODEL', 'gpt-5-nano')},gpt-4.1-nano,gpt-4o-mini`).split(',').map((m) => m.trim()).filter(Boolean),
  /** Rubles per 1M tokens, in and out, for counting the budget. */
  priceIn: num('PRICE_IN_RUB', 20),
  priceOut: num('PRICE_OUT_RUB', 104),
  /** Everyone together may spend this much a day; past it, the AI rests until midnight (Moscow). */
  budgetPerDay: num('BUDGET_RUB_PER_DAY', 20),
  /** Per computer and per address, a day. */
  questionsPerDevice: num('QUESTIONS_PER_DEVICE', 20),
  requestsPerIp: num('REQUESTS_PER_IP', 80),
  maxOutputTokens: num('MAX_OUTPUT_TOKENS', 900),
  stateFile: env('STATE_FILE', './state.json'),
  /**
   * GigaChat, asked first when its authorization key is set (base64 of «Client ID:Client Secret», from the
   * project's page at developers.sber.ru). Its servers are signed by the Russian root certificate: the service
   * starts with NODE_EXTRA_CA_CERTS pointing to it (install.sh does that).
   */
  gigachat: {
    key: env('GIGACHAT_AUTH_KEY', '').replace(/^\s*basic\s+/i, '').replace(/\s+/g, ''),
    scope: env('GIGACHAT_SCOPE', 'GIGACHAT_API_PERS'),
    model: env('GIGACHAT_MODEL', 'GigaChat-2'),
    oauth: env('GIGACHAT_OAUTH_URL', 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth'),
    api: env('GIGACHAT_API_URL', 'https://gigachat.devices.sberbank.ru/api/v1').replace(/\/$/, ''),
    /** It answers one request at a time: past this many waiting, a question goes to the paid API at once. */
    maxWaiting: num('GIGACHAT_MAX_WAITING', 3),
  },
};

if (!CONFIG.apiKey && !CONFIG.gigachat.key) {
  console.error('No AI key: put AI_API_KEY (bash set-key.sh) or GIGACHAT_AUTH_KEY (bash set-key.sh gigachat) in /opt/ro-helper/.env');
  process.exit(1);
}

/** The day by Moscow time: limits start over at midnight there, where most players are. */
const today = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);

// ——— What was spent today, kept on disk so a restart does not reset the limits ———

/** A fresh day: nothing spent, nothing asked; `answered` — who answered, and why the paid API had to. */
const freshDay = () => ({ day: today(), spent: 0, devices: {}, ips: {}, answered: { gigachat: 0, paid: 0, why: {} } });
let state = freshDay();
if (existsSync(CONFIG.stateFile)) {
  try {
    state = { ...freshDay(), ...JSON.parse(readFileSync(CONFIG.stateFile, 'utf8')) };
  } catch {
    // A broken file starts the day over.
  }
}
let dirty = false;
setInterval(() => {
  if (!dirty) return;
  dirty = false;
  writeFileSync(`${CONFIG.stateFile}.part`, JSON.stringify(state));
  renameSync(`${CONFIG.stateFile}.part`, CONFIG.stateFile);
}, 5000).unref();

function rollDay() {
  if (state.day === today()) return;
  state = freshDay();
  dirty = true;
}

/** Why this request may not go on today, or nothing when it may. */
function refusal(device, ip, kind) {
  rollDay();
  if (state.spent >= CONFIG.budgetPerDay) return 'На сегодня ИИ Кремлёвского Ассистента исчерпал общий лимит. Он снова заработает после полуночи по Москве.';
  if ((state.ips[ip] ?? 0) >= CONFIG.requestsPerIp) return 'Слишком много вопросов с вашего адреса за сегодня. Попробуйте завтра.';
  const used = state.devices[device] ?? { questions: 0 };
  if (kind === 'question' && used.questions >= CONFIG.questionsPerDevice) return `На сегодня вопросы ИИ закончились (${CONFIG.questionsPerDevice} в день). Они снова появятся после полуночи по Москве.`;
  return null;
}

function count(device, ip, kind, rubles) {
  const used = (state.devices[device] ??= { questions: 0 });
  if (kind === 'question') used.questions += 1;
  state.ips[ip] = (state.ips[ip] ?? 0) + 1;
  state.spent += rubles;
  dirty = true;
}

// ——— The AI ———

/** The AI API's own words on what went wrong: ProxyAPI writes them in `detail`, OpenAI-style APIs in `error.message`. */
class UpstreamError extends Error {
  constructor(status, body, raw) {
    const said = body?.detail ?? body?.error?.message ?? (raw || '').slice(0, 300);
    super(`AI API ${status}: ${typeof said === 'string' ? said : JSON.stringify(said)}`);
    this.status = status;
  }
}

/**
 * One call to the AI API. A «too many requests» (429) or a busy backend (502–504) is tried again after a pause,
 * twice, before the player is told: a short burst of requests over the API's rate should not reach the player.
 */
async function upstream(path, init, tries = 3) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${CONFIG.apiBase}${path}`, init);
    const raw = await response.text();
    let body = null;
    try {
      body = JSON.parse(raw);
    } catch {
      // Not JSON: the raw text says what happened.
    }
    if (response.ok) return body;
    const retry = [429, 502, 503, 504].includes(response.status) && attempt < tries - 1;
    const error = new UpstreamError(response.status, body, raw);
    console.error(new Date().toISOString(), retry ? `retrying: ${error.message}` : error.message);
    if (!retry) throw error;
    const wait = Number(response.headers.get('retry-after')) * 1000 || 1500 * (attempt + 1);
    await new Promise((resolve) => setTimeout(resolve, Math.min(wait, 8000)));
  }
}

/** Asks each model in turn while they are busy; any other failure is final. */
async function inTurn(models, call) {
  let last;
  for (const model of models) {
    try {
      return await call(model);
    } catch (error) {
      last = error;
      const busy = error instanceof UpstreamError && [429, 502, 503, 504].includes(error.status);
      if (!busy) throw error;
    }
  }
  throw last;
}

/** The paid OpenAI-compatible API, model after model while they are busy. */
async function paid({ system, messages, json, think }) {
  if (!CONFIG.apiKey) throw new UpstreamError(503, null, 'no paid API key');
  const body = await inTurn(CONFIG.models, (model) =>
    upstream(
      '/chat/completions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CONFIG.apiKey}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: system }, ...messages],
          // The thinking is paid for and counts toward the tokens: a law lookup needs little of it, weighing a lawyer's
          // demands against the law needs more — the answer must still fit after it.
          max_completion_tokens: think ? CONFIG.maxOutputTokens * 4 : CONFIG.maxOutputTokens,
          ...(model.startsWith('gpt-5') ? { reasoning_effort: think ? 'low' : 'minimal' } : {}),
          ...(json ? { response_format: { type: 'json_object' } } : {}),
        }),
      },
      // With another model to go to, one pause is enough before moving on.
      2,
    ),
  );
  const text = body?.choices?.[0]?.message?.content ?? '';
  const usage = body?.usage ?? {};
  const rubles = ((usage.prompt_tokens ?? 0) * CONFIG.priceIn + (usage.completion_tokens ?? 0) * CONFIG.priceOut) / 1e6;
  return { text, rubles };
}

// ——— GigaChat ———

/** Why GigaChat did not answer this one: the paid API then does. */
class Declined extends Error {}

/** The access token: its authorization key is exchanged for one that lasts 30 minutes, renewed a minute early. */
let token = { value: '', until: 0 };
async function gigachatToken() {
  if (token.value && Date.now() < token.until - 60_000) return token.value;
  const response = await fetch(CONFIG.gigachat.oauth, {
    method: 'POST',
    headers: { Authorization: `Basic ${CONFIG.gigachat.key}`, RqUID: crypto.randomUUID(), 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ scope: CONFIG.gigachat.scope }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.access_token) throw new Declined(`token ${response.status}: ${body?.message ?? ''}`);
  token = { value: body.access_token, until: Number(body.expires_at) || Date.now() + 30 * 60_000 };
  return token.value;
}

/** One request at a time, as GigaChat takes them; how many wait for their turn. */
let turn = Promise.resolve();
let waiting = 0;
function inGigachatTurn(call) {
  if (waiting >= CONFIG.gigachat.maxWaiting) return Promise.reject(new Declined('queue'));
  waiting += 1;
  const mine = turn.then(call);
  turn = mine.catch(() => undefined).finally(() => {
    waiting -= 1;
  });
  return mine;
}

/** A JSON answer must be JSON: a broken one is the paid API's to give, not the player's to see. */
function readableJson(text) {
  try {
    JSON.parse(text.trim().replace(/^```(?:json)?\s*|```\s*$/g, ''));
    return true;
  } catch {
    return false;
  }
}

async function gigachat({ system, messages, json }) {
  return inGigachatTurn(async () => {
    const response = await fetch(`${CONFIG.gigachat.api}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await gigachatToken()}` },
      body: JSON.stringify({ model: CONFIG.gigachat.model, messages: [{ role: 'system', content: system }, ...messages], max_tokens: CONFIG.maxOutputTokens }),
    });
    const body = await response.json().catch(() => null);
    // 401: the token went stale early — the next request takes a new one. 402/429: the free tokens are used up, or too fast.
    if (response.status === 401) token = { value: '', until: 0 };
    if (!response.ok) throw new Declined(`http ${response.status}`);
    const choice = body?.choices?.[0];
    const text = choice?.message?.content ?? '';
    // Sber's filter answers some topics (drugs, say) with a stock text and this reason — whatever the prompt says.
    if (choice?.finish_reason === 'blacklist') throw new Declined('blacklist');
    if (!text.trim()) throw new Declined('empty');
    if (json && !readableJson(text)) throw new Declined('format');
    return { text, rubles: 0 };
  });
}

/** GigaChat first, when it is set up; the paid API for whatever it does not answer. */
async function chat(request) {
  if (CONFIG.gigachat.key) {
    try {
      const answer = await gigachat(request);
      state.answered.gigachat += 1;
      dirty = true;
      return answer;
    } catch (error) {
      const why = error instanceof Declined ? error.message.split(' ')[0] : 'network';
      state.answered.why[why] = (state.answered.why[why] ?? 0) + 1;
      if (!(error instanceof Declined) || why === 'token') console.error(new Date().toISOString(), 'GigaChat:', error.message ?? error);
      if (!CONFIG.apiKey) throw new UpstreamError(502, null, `GigaChat: ${why}`);
    }
  }
  const answer = await paid(request);
  state.answered.paid += 1;
  dirty = true;
  return answer;
}

// ——— HTTP ———

/** A question with a dozen articles is some 60 KB. Text only: no speech is taken — it is recognised on the players' computers. */
const LIMITS = { '/v1/chat': 200_000 };

function readBody(request, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('too large'));
        request.destroy();
      } else chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function send(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET',
      'Access-Control-Allow-Headers': 'Content-Type, X-Device',
    });
    return response.end();
  }
  if (request.method === 'GET' && request.url === '/v1/status') {
    rollDay();
    return send(response, 200, { ok: true, open: state.spent < CONFIG.budgetPerDay, answered: state.answered, spent: Math.round(state.spent * 100) / 100 });
  }
  const limit = LIMITS[request.url];
  if (request.method !== 'POST' || !limit) return send(response, 404, { error: 'Нет такого адреса' });

  // Caddy in front tells the player's address; the device is a random id the app keeps.
  const ip = String(request.headers['x-forwarded-for'] ?? request.socket.remoteAddress ?? '').split(',')[0].trim();
  const device = String(request.headers['x-device'] ?? '').slice(0, 64);
  if (!/^[\w-]{8,64}$/.test(device)) return send(response, 400, { error: 'Обновите Кремлёвский Ассистент до последней версии.' });

  let input;
  try {
    input = JSON.parse(await readBody(request, limit));
  } catch {
    return send(response, 413, { error: 'Слишком большой запрос.' });
  }

  try {
    // Every step of one question — the law terms, then the answer — is one call; only the answer counts as a question.
    const kind = input.counts === false ? 'step' : 'question';
    const why = refusal(device, ip, kind);
    if (why) return send(response, 429, { error: why });
    const messages = Array.isArray(input.messages)
      ? input.messages.filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').slice(-14)
      : [];
    if (!messages.length || typeof input.system !== 'string') return send(response, 400, { error: 'Пустой вопрос.' });
    const { text, rubles } = await chat({ system: input.system.slice(0, 8000), messages, json: !!input.json, think: input.think === true });
    count(device, ip, kind, rubles);
    return send(response, 200, { text });
  } catch (error) {
    if (!(error instanceof UpstreamError)) console.error(new Date().toISOString(), error);
    const busy = error instanceof UpstreamError && error.status === 429;
    return send(response, 502, { error: busy ? 'ИИ сейчас перегружен. Попробуйте через минуту.' : 'ИИ сейчас не отвечает. Попробуйте через минуту.' });
  }
});

server.listen(CONFIG.port, '127.0.0.1', () =>
  console.log(
    `AI server on 127.0.0.1:${CONFIG.port}: ${CONFIG.gigachat.key ? `GigaChat ${CONFIG.gigachat.model} first, then ` : ''}${CONFIG.apiKey ? `paid ${CONFIG.models.join(' → ')}` : 'no paid API'}`,
  ),
);
