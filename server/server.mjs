// The AI server of Кремлёвский Ассистент: the app asks the AI through it, so players need no key of their own. The AI key lives only
// here, in the environment of this server (see env.example) — never in the app, which anyone can take apart.
//
// It asks GigaChat (Sber's free tier) first when its key is set, and any OpenAI-compatible API (ProxyAPI, VseGPT…)
// when GigaChat refuses, is busy or has used up its free tokens — so the paid API pays only for what GigaChat does
// not answer. It keeps the spending in check: a few questions a day per computer and per address, and a daily
// budget in rubles for everyone together.
// Plain Node (18+ — Ubuntu 24.04 ships 18: no global `crypto`, import what is used), no packages: `node server.mjs`, behind Caddy for HTTPS (see README.md).
import { createHash, createPublicKey, randomUUID, timingSafeEqual, verify } from 'node:crypto';
import { createServer } from 'node:http';
import { appendFileSync, readFileSync, writeFileSync, renameSync, existsSync, statSync } from 'node:fs';

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
  /**
   * The model that answers the player's question itself (the analysis — what the app counts as a question), while
   * GigaChat answers its steps (the search phrases). Empty: GigaChat first for everything, as before.
   */
  // In turn, comma-separated: «gigachat:GigaChat-3-Ultra» is a model of GigaChat's (its free tokens first), any other a
  // model of the paid API; when one does not answer — its free tokens used up, the budget spent — the next does.
  analysisModels: env('ANALYSIS_MODEL', '').split(',').map((m) => m.trim()).filter(Boolean),
  /** Rubles per 1M tokens, in and out, for counting the budget: of a model not in MODEL_PRICES. */
  priceIn: num('PRICE_IN_RUB', 20),
  priceOut: num('PRICE_OUT_RUB', 104),
  /**
   * Everyone together may spend this much a day. Past it the paid API rests until midnight (Moscow): with GigaChat
   * set up, the questions go on to it; without, the AI rests too.
   */
  budgetPerDay: num('BUDGET_RUB_PER_DAY', 20),
  /** Per computer and per address, a day. */
  questionsPerDevice: num('QUESTIONS_PER_DEVICE', 50),
  /**
   * Sign-in (ADR 0002): the app sends the player's Supabase token; its signature is checked by the project's public
   * keys (no secret here), and the questions are counted per account — one player on two computers, one limit.
   * Empty SUPABASE_URL: no sign-in at all. REQUIRE_SIGN_IN=1: no answer without it (after the announcement).
   */
  supabaseUrl: env('SUPABASE_URL', '').replace(/\/$/, ''),
  requireSignIn: env('REQUIRE_SIGN_IN', '0') === '1',
  questionsPerAccount: num('QUESTIONS_PER_ACCOUNT', 50),
  /**
   * A faction's leader or deputy (their role in the project's table, read with the player's own token and the
   * project's publishable key — the database lets a player read their own roles) asks more a day. No key: no
   * roles read, everyone signed in has QUESTIONS_PER_ACCOUNT.
   */
  supabaseKey: env('SUPABASE_PUBLISHABLE_KEY', '').trim(),
  questionsPerLeader: num('QUESTIONS_PER_LEADER', 100),
  requestsPerIp: num('REQUESTS_PER_IP', 200),
  maxOutputTokens: num('MAX_OUTPUT_TOKENS', 900),
  stateFile: env('STATE_FILE', './state.json'),
  /**
   * The players' marks of the answers (👍, 👎, «Исправить»), one JSON line each, with no id of the player or the
   * computer: what was asked, what the app answered, the mark. For the admins to read and improve the search.
   */
  feedbackFile: env('FEEDBACK_FILE', './feedback.jsonl'),
  feedbackPerDevice: num('FEEDBACK_PER_DEVICE', 30),
  /** Past this size the file takes no more until the admins have read and moved it. */
  feedbackMaxBytes: num('FEEDBACK_MAX_MB', 50) * 1024 * 1024,
  /**
   * The players' answers to the app's short polls (one question, ready answers, never required): the poll, the
   * answer, the version and the server — no id of the player or the computer. One answer a poll on a computer is the
   * app's to keep; here only a few a day per computer.
   */
  surveyFile: env('SURVEY_FILE', './survey.jsonl'),
  surveyPerDevice: num('SURVEY_PER_DEVICE', 10),
  /**
   * The app's reports of its own errors (what broke and where: the version, Windows, the part of the app, the
   * message and where in the code) — nothing the player typed. On by default, off in the settings.
   */
  crashFile: env('CRASH_FILE', './crashes.jsonl'),
  crashPerDevice: num('CRASH_PER_DEVICE', 20),
  /**
   * The players' shifts, shared by their choice (off unless turned on): the server of the game, the job, how long, the
   * rubles an hour and whether a bonus hour was on — no id of the player or the computer. Summed up for everyone as
   * the median a job pays on a server, over the last days, once enough shifts are in.
   */
  earningsFile: env('EARNINGS_FILE', './earnings.jsonl'),
  earningsPerDevice: num('EARNINGS_PER_DEVICE', 20),
  earningsDays: num('EARNINGS_DAYS', 14),
  earningsMin: num('EARNINGS_MIN', 5),
  /** Past this size each of the two files takes no more until the admins have read and moved it. */
  reportsMaxBytes: num('REPORTS_MAX_MB', 20) * 1024 * 1024,
  /** The admins' reviews of the marks: approved, rejected, to check again — with the normal form they gave. */
  reviewsFile: env('REVIEWS_FILE', './reviews.json'),
  /**
   * Answers already given (ADR 0007): the same question with the same sources is answered again from here, with no
   * AI call and nothing off the player's limit. Kept this many days (0 — no cache), at most so many, no id of
   * anyone; a 👎 to an answer drops it.
   */
  cacheFile: env('CACHE_FILE', './cache.json'),
  cacheDays: num('CACHE_DAYS', 7),
  cacheMax: num('CACHE_MAX', 5000),
  /**
   * The models an admin may ask for one request (the exam, comparing them before a change): «gigachat» or a model of
   * the paid API. Such a request is off the computer's limit, not kept in the cache, and says its tokens.
   */
  trialModels: env('TRIAL_MODELS', 'gigachat,gpt-5-nano,gpt-4.1-nano,gpt-4.1-mini,gpt-4o-mini').split(',').map((m) => m.trim()).filter(Boolean),
  /** The admins' token for reading the marks from the app (bash set-key.sh admin); none — no reading. */
  adminToken: env('ADMIN_TOKEN', '').trim(),
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

/** A fresh day: nothing spent, nothing asked; `answered` — who answered, and why the paid API had to; `marks` — marks taken. */
const freshDay = () => ({ day: today(), spent: 0, devices: {}, accounts: {}, ips: {}, answered: { gigachat: 0, paid: 0, cached: 0, why: {} }, marks: 0, timing: {} });

/**
 * How long each model took today, to find what makes an answer slow: the calls, the ones that failed, and in all
 * the milliseconds waited in GigaChat's queue (one request at a time) and spent answering, with the longest answer.
 */
function timed(model, waitMs, runMs, ok) {
  const t = ((state.timing ??= {})[model] ??= { calls: 0, failed: 0, waitMs: 0, runMs: 0, maxMs: 0 });
  t.calls += 1;
  if (!ok) t.failed += 1;
  t.waitMs += waitMs;
  t.runMs += runMs;
  t.maxMs = Math.max(t.maxMs, waitMs + runMs);
  dirty = true;
}
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

/**
 * Why this request may not go on today, or nothing when it may. A signed-in player's questions are counted on their
 * account, not on the computer; the address's limit stands for everyone, against a flood of accounts.
 */
function refusal(device, ip, kind, account, leader = false) {
  rollDay();
  // Past the budget GigaChat, free, goes on answering; only with no GigaChat does the AI rest.
  if (state.spent >= CONFIG.budgetPerDay && !CONFIG.gigachat.key) return 'На сегодня ИИ Кремлёвского Ассистента исчерпал общий лимит. Он снова заработает после полуночи по Москве.';
  if ((state.ips[ip] ?? 0) >= CONFIG.requestsPerIp) return 'Слишком много вопросов с вашего адреса за сегодня. Попробуйте завтра.';
  if (account) {
    const mine = state.accounts?.[account] ?? { questions: 0 };
    const limit = leader ? CONFIG.questionsPerLeader : CONFIG.questionsPerAccount;
    if (kind === 'question' && mine.questions >= limit) return `На сегодня вопросы ИИ закончились (${limit} в день). Они снова появятся после полуночи по Москве.`;
    return null;
  }
  const used = state.devices[device] ?? { questions: 0 };
  if (kind === 'question' && used.questions >= CONFIG.questionsPerDevice) return `На сегодня вопросы ИИ закончились (${CONFIG.questionsPerDevice} в день). Они снова появятся после полуночи по Москве.`;
  return null;
}

function count(device, ip, kind, rubles, account) {
  const used = account ? ((state.accounts ??= {})[account] ??= { questions: 0 }) : (state.devices[device] ??= { questions: 0 });
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
async function paid(request, models = CONFIG.models) {
  const started = Date.now();
  try {
    const answer = await paidOnce(request, models);
    timed(answer.model, 0, Date.now() - started, true);
    return answer;
  } catch (error) {
    timed(models[0], 0, Date.now() - started, false);
    throw error;
  }
}

async function paidOnce({ system, messages, json, think }, models) {
  if (!CONFIG.apiKey) throw new UpstreamError(503, null, 'no paid API key');
  let used = models[0];
  const body = await inTurn(models, (model) =>
    (used = model) &&
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
  const [priceIn, priceOut] = MODEL_PRICES[used] ?? [CONFIG.priceIn, CONFIG.priceOut];
  const rubles = ((usage.prompt_tokens ?? 0) * priceIn + (usage.completion_tokens ?? 0) * priceOut) / 1e6;
  return { text, rubles, usage: { input: usage.prompt_tokens ?? 0, output: usage.completion_tokens ?? 0 }, model: used };
}

/** Rubles per 1M tokens, in and out, by ProxyAPI's list (October 2026): the budget counts what each model costs. */
const MODEL_PRICES = {
  'gpt-4.1-mini': [104, 413],
  'gpt-4.1-nano': [26, 104],
  'gpt-5-nano': [13, 104],
  'gpt-5-mini': [65, 516],
};

// ——— GigaChat ———

/** Why GigaChat did not answer this one: the paid API then does. */
class Declined extends Error {}

/** The access token: its authorization key is exchanged for one that lasts 30 minutes, renewed a minute early. */
let token = { value: '', until: 0 };
async function gigachatToken() {
  if (token.value && Date.now() < token.until - 60_000) return token.value;
  const response = await fetch(CONFIG.gigachat.oauth, {
    method: 'POST',
    headers: { Authorization: `Basic ${CONFIG.gigachat.key}`, RqUID: randomUUID(), 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
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
function inGigachatTurn(call, model) {
  if (waiting >= CONFIG.gigachat.maxWaiting) return Promise.reject(new Declined('queue'));
  waiting += 1;
  const queued = Date.now();
  const mine = turn.then(async () => {
    const started = Date.now();
    let ok = false;
    try {
      const result = await call();
      ok = true;
      return result;
    } finally {
      timed(`gigachat:${model}`, started - queued, Date.now() - started, ok);
    }
  });
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

async function gigachat({ system, messages, json }, model = CONFIG.gigachat.model) {
  return inGigachatTurn(async () => {
    const response = await fetch(`${CONFIG.gigachat.api}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await gigachatToken()}` },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, ...messages], max_tokens: CONFIG.maxOutputTokens }),
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
    const usage = body?.usage ?? {};
    return { text, rubles: 0, usage: { input: usage.prompt_tokens ?? 0, output: usage.completion_tokens ?? 0 } };
  }, model);
}

/**
 * Who answers. The player's question itself goes to the ANALYSIS_MODEL ones in turn — a GigaChat model on its
 * free tokens, a paid one while the day's budget allows. Everything else, and what none of them answered: GigaChat
 * first, when it is set up; the paid API for what it does not answer, while the budget allows.
 */
async function chat(request, kind = 'question') {
  const canPay = !!CONFIG.apiKey && state.spent < CONFIG.budgetPerDay;
  if (kind === 'question') {
    for (const name of CONFIG.analysisModels) {
      const giga = name.startsWith('gigachat:');
      if (giga ? !CONFIG.gigachat.key : !canPay) continue;
      try {
        const answer = giga ? await gigachat(request, name.slice('gigachat:'.length)) : await paid(request, [name]);
        state.answered[giga ? 'gigachat' : 'paid'] += 1;
        dirty = true;
        return answer;
      } catch (error) {
        // Its free tokens used up (402), busy, or the answer unreadable: the next one answers.
        console.error(new Date().toISOString(), `${name}:`, error.message ?? error);
      }
    }
  }
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
      // Past the budget, or with no paid API, what GigaChat declines is told as the AI not answering.
      if (!canPay) throw new UpstreamError(502, null, `GigaChat: ${why}`);
    }
  }
  const answer = await paid(request);
  state.answered.paid += 1;
  dirty = true;
  return answer;
}

// ——— Answers already given (ADR 0007) ———

/** A question as it is matched: the 👎 to an answer finds the answer by it. */
const normalQuestion = (text) => (typeof text === 'string' ? text.replace(/\s+/g, ' ').trim().toLowerCase().replace(/ё/g, 'е').slice(0, 600) : '');

/** The request as the AI gets it: the same key, the same answer. The laws' text is in it — new laws, a new key. */
const cacheKey = ({ system, messages, json, think }) => createHash('sha256').update(JSON.stringify([system, messages, json, think])).digest('hex');

/** key → { text, at, question }, oldest first. */
const cache = new Map();
if (existsSync(CONFIG.cacheFile)) {
  try {
    for (const [key, entry] of JSON.parse(readFileSync(CONFIG.cacheFile, 'utf8'))) cache.set(key, entry);
  } catch {
    // A broken file: the cache starts over.
  }
}
let cacheDirty = false;
setInterval(() => {
  if (!cacheDirty) return;
  cacheDirty = false;
  writeFileSync(`${CONFIG.cacheFile}.part`, JSON.stringify([...cache]), { mode: 0o600 });
  renameSync(`${CONFIG.cacheFile}.part`, CONFIG.cacheFile);
}, 15000).unref();

function cached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > CONFIG.cacheDays * 86_400_000) {
    cache.delete(key);
    cacheDirty = true;
    return null;
  }
  return entry;
}

function rememberAnswer(key, text, question) {
  if (CONFIG.cacheDays <= 0 || !question) return;
  cache.delete(key);
  cache.set(key, { text, at: Date.now(), question });
  while (cache.size > CONFIG.cacheMax) cache.delete(cache.keys().next().value);
  cacheDirty = true;
}

/** A 👎: every answer kept for that question is dropped — the next one is asked of the AI again. */
function forgetAnswers(question) {
  const q = normalQuestion(question);
  for (const [key, entry] of cache) if (entry.question === q) cache.delete(key);
  cacheDirty = true;
}

/** An answer worth keeping: a JSON answer that is JSON at all — a broken one would only be retried again and again. */
function keepable(text, json) {
  if (!json) return true;
  try {
    JSON.parse(text.trim().replace(/^```(?:json)?\s*|```\s*$/g, ''));
    return true;
  } catch {
    return false;
  }
}

// ——— The players' marks ———

const clip = (value, max) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/**
 * A mark as it is kept: only these fields, each cut to its length — nothing else the request may carry, and no id.
 * Null when it is no mark at all.
 */
function markOf(input) {
  const vote = input?.vote === 'up' || input?.vote === 'down' ? input.vote : null;
  const question = clip(input?.question, 600);
  if (!vote || !question) return null;
  const correction = vote === 'down' ? clip(input?.correction, 1000) : '';
  return {
    // A random id, for the admins' review: nothing to tie it to anyone.
    id: randomUUID(),
    // To the minute: when, not who.
    at: new Date().toISOString().slice(0, 16),
    server: clip(input?.server, 40),
    app: clip(input?.app, 20),
    vote,
    question,
    type: clip(input?.type, 20),
    scope: clip(input?.scope, 20),
    status: clip(input?.status, 20),
    norms: (Array.isArray(input?.norms) ? input.norms : []).map((n) => clip(n, 80)).filter(Boolean).slice(0, 10),
    ...(correction ? { correction } : {}),
  };
}

/** Why this mark may not be kept today, or nothing when it may. */
function markRefusal(device) {
  rollDay();
  const used = state.devices[device]?.marks ?? 0;
  if (used >= CONFIG.feedbackPerDevice) return 'На сегодня отзывов достаточно — спасибо! Завтра можно снова.';
  if (existsSync(CONFIG.feedbackFile) && statSync(CONFIG.feedbackFile).size >= CONFIG.feedbackMaxBytes) return 'Отзывы сейчас не принимаются — попробуйте позже.';
  return null;
}

function keepMark(device, mark) {
  appendFileSync(CONFIG.feedbackFile, `${JSON.stringify(mark)}\n`, { mode: 0o600 });
  const used = (state.devices[device] ??= { questions: 0 });
  used.marks = (used.marks ?? 0) + 1;
  state.marks = (state.marks ?? 0) + 1;
  dirty = true;
}

// ——— The players' poll answers and the app's error reports ———

/** A poll answer as it is kept: the poll, the answer, when, the version and the server. Null when it is none. */
function answerOf(input) {
  const survey = clip(input?.survey, 40);
  const answer = clip(input?.answer, 80);
  if (!survey || !answer) return null;
  return { at: new Date().toISOString().slice(0, 16), survey, answer, app: clip(input?.app, 20), server: clip(input?.server, 40) };
}

/** An error report as it is kept: what broke and where, cut to length; a random id for the admins. Null when none. */
function crashOf(input) {
  const message = clip(input?.message, 300);
  if (!message) return null;
  // The stack keeps its lines: where in the code. The app has taken the player's own paths out of it.
  const stack = typeof input?.stack === 'string' ? input.stack.slice(0, 2000) : '';
  return {
    id: randomUUID(),
    at: new Date().toISOString().slice(0, 16),
    app: clip(input?.app, 20),
    os: clip(input?.os, 60),
    area: clip(input?.area, 40),
    message,
    ...(stack ? { stack } : {}),
  };
}

/** Keeps a line in one of the two files, or says why not: too many today from this computer, or the file is full. */
function keepReport(device, kind, file, perDevice, line) {
  rollDay();
  const used = (state.devices[device] ??= { questions: 0 });
  if ((used[kind] ?? 0) >= perDevice) return 'На сегодня достаточно — спасибо!';
  if (existsSync(file) && statSync(file).size >= CONFIG.reportsMaxBytes) return 'Сейчас не принимается — попробуйте позже.';
  appendFileSync(file, `${JSON.stringify(line)}\n`, { mode: 0o600 });
  used[kind] = (used[kind] ?? 0) + 1;
  dirty = true;
  return null;
}

// ——— The players' shifts: rubles an hour by job and server ———

const GAME_SERVERS = new Set(['tverskoi', 'arbatskiy', 'kutuzovskiy']);

/** A shift as it is kept: when (to the minute), the server, the job, its length and pay an hour. Null when it is none. */
function shiftOf(input) {
  const server = clip(input?.server, 40);
  const job = clip(input?.job, 40);
  const minutes = Math.round(Number(input?.minutes));
  const earned = Math.round(Number(input?.earned));
  // Ten minutes to twelve hours, and a sum a shift can bring: anything else is a mistake, not a shift.
  if (!GAME_SERVERS.has(server) || !job || !(minutes >= 10 && minutes <= 720) || !(earned > 0 && earned <= 50_000_000)) return null;
  return { at: new Date().toISOString().slice(0, 16), server, job, minutes, perHour: Math.round((earned / minutes) * 60), bonus: input?.bonus === true, app: clip(input?.app, 20) };
}

/** The summary, kept until a shift is added: read from the file at most once between two shifts. */
let earningsCache = null;

/** What each job pays an hour on a server: the median and the middle half, of the last days' shifts, when enough. */
function earningsSummary(server) {
  if (!earningsCache) {
    earningsCache = new Map();
    const since = new Date(Date.now() - CONFIG.earningsDays * 86_400_000).toISOString().slice(0, 16);
    if (existsSync(CONFIG.earningsFile)) {
      for (const line of readFileSync(CONFIG.earningsFile, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try {
          const shift = JSON.parse(line);
          if (shift.at < since) continue;
          const byJob = earningsCache.get(shift.server) ?? new Map();
          earningsCache.set(shift.server, byJob.set(shift.job, [...(byJob.get(shift.job) ?? []), shift.perHour]));
        } catch {
          // A broken line is skipped.
        }
      }
    }
  }
  const jobs = {};
  for (const [job, rates] of earningsCache.get(server) ?? []) {
    if (rates.length < CONFIG.earningsMin) continue;
    const sorted = [...rates].sort((a, b) => a - b);
    const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
    jobs[job] = { median: at(0.5), low: at(0.25), high: at(0.75), shifts: sorted.length };
  }
  return jobs;
}

/** Each poll's answers counted, for the admins. */
function surveySummary() {
  const polls = {};
  if (!existsSync(CONFIG.surveyFile)) return polls;
  for (const line of readFileSync(CONFIG.surveyFile, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const { survey, answer } = JSON.parse(line);
      polls[survey] ??= {};
      polls[survey][answer] = (polls[survey][answer] ?? 0) + 1;
    } catch {
      // A broken line is skipped.
    }
  }
  return polls;
}

/** The latest error reports, newest first. */
function latestCrashes(limit) {
  if (!existsSync(CONFIG.crashFile)) return [];
  const crashes = [];
  for (const line of readFileSync(CONFIG.crashFile, 'utf8').split('\n').reverse()) {
    if (crashes.length >= limit) break;
    if (!line.trim()) continue;
    try {
      crashes.push(JSON.parse(line));
    } catch {
      // A broken line is skipped.
    }
  }
  return crashes;
}

// ——— The admins' reviews: raw → approved / rejected / to check again ———

const REVIEW = new Set(['approved', 'rejected', 'recheck']);
const SCOPES = new Set(['law', 'server_rule']);

let reviews = {};
if (existsSync(CONFIG.reviewsFile)) {
  try {
    reviews = JSON.parse(readFileSync(CONFIG.reviewsFile, 'utf8'));
  } catch {
    console.error(new Date().toISOString(), 'reviews: the file is broken — starting with none, the file is kept');
  }
}
function saveReviews() {
  writeFileSync(`${CONFIG.reviewsFile}.part`, JSON.stringify(reviews), { mode: 0o600 });
  renameSync(`${CONFIG.reviewsFile}.part`, CONFIG.reviewsFile);
}

/**
 * The admins' word on a mark: its status and, when they give it, the normal form — the players' expression and
 * the same in the words of the base, the scope, what is asked, the right articles. Null when it is none.
 */
function reviewOf(input) {
  const id = clip(input?.id, 40);
  if (!id || !REVIEW.has(input?.status)) return null;
  const phrase = clip(input?.phrase, 80).toLowerCase();
  const normalized = clip(input?.normalized, 120);
  return {
    id,
    status: input.status,
    at: new Date().toISOString().slice(0, 16),
    ...(phrase && normalized ? { phrase, normalized } : {}),
    ...(SCOPES.has(input?.scope) ? { scope: input.scope } : {}),
    ...(clip(input?.intent, 30) ? { intent: clip(input.intent, 30) } : {}),
    ...(Array.isArray(input?.expected) ? { expected: input.expected.map((e) => clip(e, 40)).filter(Boolean).slice(0, 5) } : {}),
  };
}

/** The approved expressions of the players, for every app: no question, no mark — the phrase and its normal form. */
function approvedAliases() {
  return Object.values(reviews)
    .filter((r) => r.status === 'approved' && r.phrase && r.normalized)
    .map(({ phrase, normalized, scope, intent }) => ({ phrase, normalized, ...(scope ? { scope } : {}), ...(intent ? { intent } : {}) }));
}

/** Whether the request carries the admins' token; compared in constant time. */
function isAdmin(request) {
  if (CONFIG.adminToken.length < 16) return false;
  const given = Buffer.from(String(request.headers.authorization ?? '').replace(/^Bearer\s+/i, ''));
  const token = Buffer.from(CONFIG.adminToken);
  return given.length === token.length && timingSafeEqual(given, token);
}

/** The latest marks, newest first, each with the admins' review: by vote, correction or review status. */
function latestMarks(filter, limit) {
  if (!existsSync(CONFIG.feedbackFile)) return [];
  const marks = [];
  for (const line of readFileSync(CONFIG.feedbackFile, 'utf8').split('\n').reverse()) {
    if (marks.length >= limit) break;
    if (!line.trim()) continue;
    try {
      const mark = JSON.parse(line);
      const review = mark.id ? reviews[mark.id] : undefined;
      const status = review?.status ?? 'raw';
      if (filter === 'down' && mark.vote !== 'down') continue;
      if (filter === 'fixed' && !mark.correction) continue;
      if (['raw', 'approved', 'rejected', 'recheck'].includes(filter) && status !== filter) continue;
      marks.push(review ? { ...mark, review } : mark);
    } catch {
      // A broken line is skipped.
    }
  }
  return marks;
}

// ——— Sign-in: the player's Supabase token ———

/** The project's public keys by id, read from its JWKS and read again for a key not known (they rotate). */
let jwks = { keys: new Map(), at: 0 };
async function publicKey(kid) {
  if (!jwks.keys.has(kid) && Date.now() - jwks.at > 60_000) {
    jwks.at = Date.now();
    try {
      const response = await fetch(`${CONFIG.supabaseUrl}/auth/v1/.well-known/jwks.json`, { signal: AbortSignal.timeout(5000) });
      const { keys } = await response.json();
      jwks.keys = new Map(keys.filter((k) => k.kid && k.kty === 'EC').map((k) => [k.kid, createPublicKey({ key: k, format: 'jwk' })]));
    } catch (error) {
      console.error(new Date().toISOString(), 'jwks:', error.message);
    }
  }
  return jwks.keys.get(kid);
}

const fromBase64Url = (part) => Buffer.from(part, 'base64url');

/**
 * The account a request is from: the id in a Supabase token that is signed by the project's key (ES256), not
 * expired, for this project and a signed-in player. Anything else — no token, a forged or a stale one — is no account.
 */
async function accountOf(request) {
  if (!CONFIG.supabaseUrl) return null;
  const token = String(request.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(fromBase64Url(parts[0]).toString('utf8'));
    const claims = JSON.parse(fromBase64Url(parts[1]).toString('utf8'));
    if (header.alg !== 'ES256' || typeof header.kid !== 'string') return null;
    if (claims.iss !== `${CONFIG.supabaseUrl}/auth/v1` || claims.aud !== 'authenticated' || !(claims.exp * 1000 > Date.now())) return null;
    if (typeof claims.sub !== 'string' || !/^[\w-]{8,64}$/.test(claims.sub)) return null;
    const key = await publicKey(header.kid);
    if (!key) return null;
    const signed = verify('sha256', Buffer.from(`${parts[0]}.${parts[1]}`), { key, dsaEncoding: 'ieee-p1363' }, fromBase64Url(parts[2]));
    return signed ? claims.sub : null;
  } catch {
    return null;
  }
}

/** Whether an account leads a faction or is a deputy, by account, kept for ten minutes: roles change seldom. */
const leaders = new Map();
const LEADER_TTL = 10 * 60_000;

/**
 * Whether the signed-in player is a leader or a deputy anywhere: their roles read from the project's database with
 * their own token (the rules there let a player read only their own) and the publishable key. A failure to read is
 * no role — the ordinary limit, never a refusal.
 */
async function leaderOf(account, request) {
  if (!account || !CONFIG.supabaseKey) return false;
  const known = leaders.get(account);
  if (known && Date.now() - known.at < LEADER_TTL) return known.leader;
  let leader = false;
  try {
    const token = String(request.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    const response = await fetch(`${CONFIG.supabaseUrl}/rest/v1/roles?select=role&user_id=eq.${encodeURIComponent(account)}`, {
      headers: { apikey: CONFIG.supabaseKey, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const rows = await response.json();
      leader = Array.isArray(rows) && rows.some((row) => row?.role === 'leader' || row?.role === 'deputy');
    }
  } catch (error) {
    console.error(new Date().toISOString(), 'roles:', error.message);
  }
  leaders.set(account, { leader, at: Date.now() });
  return leader;
}

// ——— HTTP ———

/** A question with a dozen articles is some 60 KB. Text only: no speech is taken — it is recognised on the players' computers. */
const LIMITS = { '/v1/chat': 200_000, '/v1/feedback': 8_000, '/v1/survey': 2_000, '/v1/crash': 8_000, '/v1/earnings': 2_000 };

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
  const request_ = request;
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET',
      'Access-Control-Allow-Headers': 'Content-Type, X-Device, Authorization',
    });
    return response.end();
  }
  if (request.method === 'GET' && request.url === '/v1/status') {
    rollDay();
    return send(response, 200, { ok: true, open: state.spent < CONFIG.budgetPerDay || !!CONFIG.gigachat.key, answered: state.answered, spent: Math.round(state.spent * 100) / 100, marks: state.marks ?? 0, cache: cache.size, timing: state.timing ?? {} });
  }
  if (request.method === 'GET' && request.url.startsWith('/v1/feedback')) {
    if (!isAdmin(request)) return send(response, 403, { error: 'Нужен ключ администратора.' });
    const params = new URL(request.url, 'http://local').searchParams;
    const filter = ['down', 'fixed', 'raw', 'approved', 'rejected', 'recheck'].includes(params.get('filter')) ? params.get('filter') : 'all';
    const count = Math.min(Math.max(Number(params.get('limit')) || 100, 1), 500);
    return send(response, 200, { marks: latestMarks(filter, count), today: state.marks ?? 0 });
  }
  if (request.method === 'GET' && request.url.startsWith('/v1/earnings')) {
    // Open to all: medians of many shifts, no line of anyone's.
    const server = new URL(request.url, 'http://local').searchParams.get('server') ?? '';
    if (!GAME_SERVERS.has(server)) return send(response, 400, { error: 'Нет такого сервера.' });
    response.setHeader('Cache-Control', 'public, max-age=600');
    return send(response, 200, { server, days: CONFIG.earningsDays, jobs: earningsSummary(server) });
  }
  if (request.method === 'GET' && request.url === '/v1/survey') {
    if (!isAdmin(request)) return send(response, 403, { error: 'Нужен ключ администратора.' });
    return send(response, 200, { polls: surveySummary() });
  }
  if (request.method === 'GET' && request.url.startsWith('/v1/crashes')) {
    if (!isAdmin(request)) return send(response, 403, { error: 'Нужен ключ администратора.' });
    const count = Math.min(Math.max(Number(new URL(request.url, 'http://local').searchParams.get('limit')) || 100, 1), 500);
    return send(response, 200, { crashes: latestCrashes(count) });
  }
  if (request.method === 'GET' && request.url === '/v1/aliases') {
    response.setHeader('Cache-Control', 'public, max-age=3600');
    return send(response, 200, { aliases: approvedAliases() });
  }
  if (request.method === 'GET' && request.url === '/v1/examples') {
    if (!isAdmin(request)) return send(response, 403, { error: 'Нужен ключ администратора.' });
    // The approved marks with their right articles: cases for the exam (scripts/eval-approved.ts).
    const marks = latestMarks('approved', 5000).filter((m) => m.review?.expected?.length);
    return send(response, 200, {
      examples: marks.map((m) => ({ id: m.id, server: m.server, question: m.question, expected: m.review.expected, ...(m.review.scope ? { scope: m.review.scope } : {}), ...(m.review.intent ? { intent: m.review.intent } : {}) })),
    });
  }
  if (request.method === 'POST' && request.url === '/v1/feedback/review') {
    if (!isAdmin(request)) return send(response, 403, { error: 'Нужен ключ администратора.' });
    let review;
    try {
      review = reviewOf(JSON.parse(await readBody(request, 4000)));
    } catch {
      return send(response, 413, { error: 'Слишком большой запрос.' });
    }
    if (!review) return send(response, 400, { error: 'Нет отзыва или статуса.' });
    reviews[review.id] = review;
    saveReviews();
    return send(response, 200, { ok: true, review });
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

  if (request.url === '/v1/feedback') {
    const mark = markOf(input);
    if (!mark) return send(response, 400, { error: 'Пустой отзыв.' });
    const why = markRefusal(device);
    if (why) return send(response, 429, { error: why });
    try {
      keepMark(device, mark);
      if (mark.vote === 'down') forgetAnswers(mark.question);
      return send(response, 200, { ok: true });
    } catch (error) {
      console.error(new Date().toISOString(), 'feedback:', error);
      return send(response, 500, { error: 'Не удалось сохранить отзыв — попробуйте позже.' });
    }
  }

  if (request.url === '/v1/earnings') {
    const line = shiftOf(input);
    if (!line) return send(response, 400, { error: 'Смена не подходит: от 10 минут до 12 часов и сумма больше нуля.' });
    try {
      const why = keepReport(device, 'shifts', CONFIG.earningsFile, CONFIG.earningsPerDevice, line);
      if (!why) earningsCache = null;
      return why ? send(response, 429, { error: why }) : send(response, 200, { ok: true });
    } catch (error) {
      console.error(new Date().toISOString(), request.url, error);
      return send(response, 500, { error: 'Не удалось сохранить — попробуйте позже.' });
    }
  }

  if (request.url === '/v1/survey' || request.url === '/v1/crash') {
    const survey = request.url === '/v1/survey';
    const line = survey ? answerOf(input) : crashOf(input);
    if (!line) return send(response, 400, { error: survey ? 'Нет ответа.' : 'Пустой отчёт.' });
    try {
      const why = survey
        ? keepReport(device, 'answers', CONFIG.surveyFile, CONFIG.surveyPerDevice, line)
        : keepReport(device, 'crashes', CONFIG.crashFile, CONFIG.crashPerDevice, line);
      return why ? send(response, 429, { error: why }) : send(response, 200, { ok: true });
    } catch (error) {
      console.error(new Date().toISOString(), request.url, error);
      return send(response, 500, { error: 'Не удалось сохранить — попробуйте позже.' });
    }
  }

  // The admins' token is no player's: an exam is not signed in. A player not signed in, when sign-in is required, is
  // told how to go on — the laws and the calculator need none.
  const account = isAdmin(request_) ? null : await accountOf(request_);
  if (CONFIG.requireSignIn && !account && !isAdmin(request_)) {
    return send(response, 401, { error: 'Чтобы спрашивать ИИ, войдите в аккаунт: «Профиль» → «Войти». Или укажите свой ключ ИИ в настройках.' });
  }

  try {
    // Every step of one question — the law terms, then the answer — is one call; only the answer counts as a question.
    const kind = input.counts === false ? 'step' : 'question';
    const messages = Array.isArray(input.messages)
      ? input.messages.filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').slice(-14)
      : [];
    if (!messages.length || typeof input.system !== 'string') return send(response, 400, { error: 'Пустой вопрос.' });
    const request = { system: input.system.slice(0, 16000), messages, json: !!input.json, think: input.think === true };
    // An admin trying a model: that model only, off the computer's limit (the daily budget still counts), no cache.
    if (typeof input.model === 'string' && isAdmin(request_)) {
      // «gigachat:GigaChat-2-Max»: any model of GigaChat's, on its free tokens.
      const gigaModel = /^gigachat:(GigaChat[\w.-]*)$/.exec(input.model)?.[1];
      if (!gigaModel && !CONFIG.trialModels.includes(input.model)) return send(response, 400, { error: `Модель не из списка: ${CONFIG.trialModels.join(', ')}` });
      rollDay();
      if (!gigaModel && input.model !== 'gigachat' && state.spent >= CONFIG.budgetPerDay) return send(response, 429, { error: 'Дневной бюджет ИИ исчерпан.' });
      const answer = gigaModel ? await gigachat(request, gigaModel) : input.model === 'gigachat' ? await gigachat(request) : await paid(request, [input.model]);
      // The budget counts what it cost; the address's limit does not: an exam would use up the admin's own day.
      state.spent += answer.rubles;
      dirty = true;
      return send(response, 200, { text: answer.text, usage: answer.usage ?? null });
    }
    // A question the app says may be answered again (a first question, not a follow-up): from the cache when it was
    // asked before — free, and off no one's limit; only the address's limit stands, against a flood.
    const question = input.cache === true ? normalQuestion(input.question) : '';
    const key = question ? cacheKey(request) : '';
    const hit = key ? cached(key) : null;
    if (hit) {
      rollDay();
      if ((state.ips[ip] ?? 0) >= CONFIG.requestsPerIp) return send(response, 429, { error: 'Слишком много вопросов с вашего адреса за сегодня. Попробуйте завтра.' });
      state.ips[ip] = (state.ips[ip] ?? 0) + 1;
      state.answered.cached = (state.answered.cached ?? 0) + 1;
      dirty = true;
      return send(response, 200, { text: hit.text, cached: true });
    }
    // A leader's or deputy's role is asked only for a question, the counted kind: a step is no question.
    const leader = kind === 'question' ? await leaderOf(account, request_) : false;
    const why = refusal(device, ip, kind, account, leader);
    if (why) return send(response, 429, { error: why });
    const { text, rubles } = await chat(request, kind);
    count(device, ip, kind, rubles, account);
    if (key && keepable(text, request.json)) rememberAnswer(key, text, question);
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
