// The AI's exam: situations from eval/cases.json, each asked the way a player asks it (law terms → search → the
// AI's analysis → the checks against the laws), and scored against the article that is the right answer. It tells
// the search's misses from the AI's, so a model or a prompt can be compared with another on the same questions.
//
//   npm run eval                                   — through the app's AI server (counts against its daily limits)
//   npm run eval -- --limit 3 --server tverskoi    — a few only
//   npm run eval -- --url https://openrouter.ai/api/v1 --model some/model   — any OpenAI-compatible AI;
//                                                    its key, if it needs one, in the AI_EVAL_KEY environment variable
//   npm run eval -- --gigachat [--model GigaChat-2-Max]  — GigaChat; its authorization key in GIGACHAT_AUTH_KEY,
//                                                    and NODE_EXTRA_CA_CERTS=<the Russian root certificate>;
//                                                    `--gigachat --models` lists the models the key may use
//   --depth full                                   — the full analysis instead of the quick one
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ServerPack } from '../src/core';
import { AiError, answerQuestion, gradeCase, openaiProvider, serverProvider, type AiProvider, type Category, type Depth, type EvalCase, type Grade } from '../src/protocol';

// about.ts reads the version Vite puts in at build time; outside Vite it is set here, before about.ts is loaded.
(globalThis as { __APP_VERSION__?: string }).__APP_VERSION__ = 'eval';
const { AI_SERVER } = await import('../src/ui/about');


const root = join(import.meta.dirname, '..');
const args = process.argv.slice(2);
const arg = (name: string) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
};

/**
 * GigaChat (Sber): the authorization key is exchanged for a token that lasts 30 minutes, and the questions are asked
 * with the token. Its servers are signed by the Russian root certificate: run with NODE_EXTRA_CA_CERTS pointing to it.
 */
const GIGACHAT = { oauth: 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth', api: 'https://gigachat.devices.sberbank.ru/api/v1' };
/**
 * The authorization key as Sber gives it: base64 of «Client ID:Client Secret». What was copied around it — «Basic »,
 * spaces, line breaks — is dropped; what cannot be one is said without showing the key.
 */
function gigachatKey(raw: string): string {
  const key = raw.replace(/^\s*(?:basic\s+)?/i, '').replace(/\s+/g, '');
  const decoded = /^[A-Za-z0-9+/=_-]+$/.test(key) ? Buffer.from(key, 'base64').toString('utf8') : '';
  if (!/^[\w-]+:[\w-]+$/.test(decoded)) {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key);
    throw new Error(
      uuid
        ? 'Скопирован Client ID или Client Secret (он похож на номер с дефисами), а нужен «Ключ авторизации» — длинная строка без дефисов, обычно кончается на «==».'
        : `Это не похоже на ключ авторизации GigaChat (скопировано ${key.length} символов). Скопируйте «Ключ авторизации» заново — целиком, без лишнего.`,
    );
  }
  return key;
}

async function gigachatToken(raw: string): Promise<string> {
  const key = gigachatKey(raw);
  const response = await fetch(GIGACHAT.oauth, {
    method: 'POST',
    headers: { Authorization: `Basic ${key}`, RqUID: crypto.randomUUID(), 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ scope: process.env.GIGACHAT_SCOPE ?? 'GIGACHAT_API_PERS' }),
  }).catch((error: unknown) => {
    const cause = (error as { cause?: { code?: string } }).cause?.code ?? String(error);
    throw new Error(`Нет связи с GigaChat (${cause}). Если про сертификат — запустите с NODE_EXTRA_CA_CERTS, как в инструкции.`);
  });
  const body = (await response.json().catch(() => null)) as { access_token?: string; message?: string } | null;
  if (!response.ok || !body?.access_token) throw new Error(`GigaChat не выдал доступ (код ${response.status}): ${body?.message ?? 'проверьте ключ авторизации'}`);
  return body.access_token;
}
/** The OpenAI-compatible provider over GigaChat, with a fresh token every 25 minutes. */
async function gigachat(key: string, model: string): Promise<AiProvider> {
  let token = await gigachatToken(key);
  let at = Date.now();
  return {
    async complete(request) {
      if (Date.now() - at > 25 * 60_000) [token, at] = [await gigachatToken(key), Date.now()];
      return openaiProvider({ url: GIGACHAT.api, key: token, model }).complete(request);
    },
  };
}

const url = arg('url');
const model = arg('model');
const giga = args.includes('--gigachat');
if (url && !model) throw new Error('С --url нужен и --model.');
if (giga && !process.env.GIGACHAT_AUTH_KEY) throw new Error('Для GigaChat задайте ключ авторизации в переменной GIGACHAT_AUTH_KEY.');
if (giga && args.includes('--models')) {
  const token = await gigachatToken(process.env.GIGACHAT_AUTH_KEY!);
  const list = (await (await fetch(`${GIGACHAT.api}/models`, { headers: { Authorization: `Bearer ${token}` } })).json()) as { data?: { id: string }[] };
  console.log('Модели GigaChat:', (list.data ?? []).map((m) => m.id).join(', '));
  process.exit(0);
}
const service: AiProvider = giga
  ? await gigachat(process.env.GIGACHAT_AUTH_KEY!, model ?? 'GigaChat-2')
  : url
    ? openaiProvider({ url, model: model!, key: process.env.AI_EVAL_KEY ?? '' })
    : serverProvider(AI_SERVER, `deval${Math.random().toString(36).slice(2, 12)}`);
/** The model's last answers, to show what it said when an answer could not be read. */
const said: string[] = [];
const provider: AiProvider = {
  async complete(request) {
    const text = await service.complete(request);
    said.push(text);
    return text;
  },
};
const via = giga ? `GigaChat · ${model ?? 'GigaChat-2'}` : url ? `${url} · ${model}` : `сервер ИИ ${AI_SERVER}`;
const depth = (arg('depth') ?? 'quick') as Depth;

const { cases: all } = JSON.parse(readFileSync(join(root, 'eval', 'cases.json'), 'utf8')) as { cases: EvalCase[] };
const only = arg('server');
const group = arg('group');
const category = arg('category');
/** --cases 29,40 — those numbers of the whole list only. */
const picked = arg('cases')?.split(',').map(Number);
const numbered = all.map((c, i) => ({ ...c, number: i + 1 }));
const cases = numbered
  .filter(
    (c) =>
      (!only || c.server === only) &&
      (!group || c.group === group) &&
      (!category || (c.category ?? 'LAW') === category) &&
      (!picked || picked.includes(c.number)),
  )
  .slice(0, Number(arg('limit') ?? Infinity));

const packs = new Map<string, ServerPack>();
const pack = (id: string) => {
  if (!packs.has(id)) packs.set(id, JSON.parse(readFileSync(join(root, 'src', 'data', `${id}.json`), 'utf8')) as ServerPack);
  return packs.get(id)!;
};

interface Row {
  number: number;
  category: Category;
  grade: Grade | null;
  error?: string;
}
const rows: Row[] = [];

console.log(`Экзамен ИИ: ${cases.length} ситуаций, ${depth === 'full' ? 'полный' : 'быстрый'} разбор, ${via}\n`);
for (const c of cases) {
  const started = Date.now();
  const categoryOf: Category = c.category ?? 'LAW';
  const row: Row = { number: c.number, category: categoryOf, grade: null };
  said.length = 0;
  try {
    const base = { provider, pack: pack(c.server), depth, choice: c.choice ?? 'auto' } as const;
    let outcome = await answerQuestion({ ...base, message: c.situation });
    // A follow-up goes on from the case the first answer left; the calls of both are counted.
    if (c.followUp && outcome.kind === 'analysis') {
      const first = outcome.analysis.aiCalls ?? 0;
      outcome = await answerQuestion({ ...base, message: c.followUp, previous: outcome.analysis.case });
      if (outcome.kind === 'analysis') outcome.analysis.aiCalls = (outcome.analysis.aiCalls ?? 0) + first;
    }
    row.grade = gradeCase(c, outcome);
  } catch (error) {
    row.error = error instanceof AiError ? `${error.kind}: ${error.message}` : String(error);
    // What the model said instead of an answer: a refusal reads differently from broken JSON.
    if (args.includes('--debug')) row.error += said.map((text) => `\n      ИИ ответил: ${text.replace(/\s+/g, ' ').slice(0, 300)}`).join('');
  }
  rows.push(row);
  const g = row.grade;
  const icon = !g ? '!' : g.hardGates.length ? '⛔' : g.pass ? '✓' : g.found === 'partly' ? '½' : '✗';
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`${icon} ${String(c.number).padStart(2)}. [${c.server} · ${categoryOf}] ${c.followUp ? `${c.situation} → ${c.followUp}` : c.situation}`);
  console.log(`      ${c.expect?.length ? `нужно ${c.expect.join(', ')} → ` : ''}${g ? g.detail : row.error} · вызовов ИИ ${g?.aiCalls ?? '?'} · ${seconds} с`);
  if (g?.hardGates.length) console.log(`      ЖЁСТКИЕ ВОРОТА: ${g.hardGates.join(' | ')}`);
  // The server's per-IP limit counts requests: a pause keeps a long run from looking like a flood.
  if (!url && !giga) await new Promise((resolve) => setTimeout(resolve, 1500));
}

// ——— The report ———
const graded = rows.filter((r) => r.grade);
const passed = rows.filter((r) => r.grade?.pass).length;
const hard = rows.filter((r) => r.grade?.hardGates.length);
const analyses = graded.filter((r) => r.grade!.detail.startsWith('ИИ:'));
const hallucinated = graded.filter((r) => r.grade!.hallucinations.length).length;
const expectsArticle = graded.filter((r) => r.grade!.found !== 'n/a');
const byCategory = new Map<Category, { total: number; passed: number; calls: number }>();
for (const r of rows) {
  const entry = byCategory.get(r.category) ?? { total: 0, passed: 0, calls: 0 };
  entry.total += 1;
  if (r.grade?.pass) entry.passed += 1;
  entry.calls += r.grade?.aiCalls ?? 0;
  byCategory.set(r.category, entry);
}
const rate = analyses.length ? Math.round((hallucinated / analyses.length) * 1000) / 10 : 0;
console.log(
  [
    '',
    `Итог: прошло ${passed} из ${rows.length}, провалено ${rows.length - passed} (из них ошибок связи или формата ${rows.length - graded.length})`,
    `Жёсткие ворота провалены: ${hard.length}${hard.length ? ` (№ ${hard.map((r) => r.number).join(', ')})` : ''}`,
    `CONFIRMED_HALLUCINATION_RATE: ${rate}% — ${hallucinated} из ${analyses.length} разборов`,
    `Нужная статья применена: ${expectsArticle.filter((r) => r.grade!.found === 'right').length} из ${expectsArticle.length}; поиск её нашёл: ${expectsArticle.filter((r) => r.grade!.searched).length} из ${expectsArticle.length}`,
    `Вопрос понят верно (тип): ${graded.filter((r) => r.grade!.classified).length} из ${graded.length}`,
    '',
    'По категориям — прошло / всего · вызовов ИИ:',
    ...[...byCategory].map(([name, e]) => `  ${name.padEnd(19)} ${e.passed}/${e.total} · ${e.calls}`),
  ].join('\n'),
);

// The run is kept, and set beside the baseline: what broke, what was fixed.
const resultsDir = join(root, 'eval', 'results');
mkdirSync(resultsDir, { recursive: true });
const result = {
  at: new Date().toISOString(),
  via,
  depth,
  cases: Object.fromEntries(rows.map((r) => [r.number, { pass: !!r.grade?.pass, hard: r.grade?.hardGates ?? [], category: r.category }])),
};
writeFileSync(join(resultsDir, 'last.json'), JSON.stringify(result, null, 2));
const baselineFile = join(resultsDir, 'baseline.json');
if (args.includes('--save-baseline')) {
  writeFileSync(baselineFile, JSON.stringify(result, null, 2));
  console.log(`\nБазовая линия сохранена: ${baselineFile}`);
} else if (existsSync(baselineFile)) {
  const baseline = JSON.parse(readFileSync(baselineFile, 'utf8')) as typeof result;
  const changes: Record<string, number[]> = { 'НОВЫЕ ПРОВАЛЫ': [], ИСПРАВЛЕНО: [], 'РЕГРЕССИИ (новые жёсткие ворота)': [], 'БЕЗ ИЗМЕНЕНИЙ': [] };
  for (const r of rows) {
    const before = baseline.cases[r.number];
    const now = result.cases[r.number];
    if (!before) continue;
    if (now.hard.length && !before.hard.length) changes['РЕГРЕССИИ (новые жёсткие ворота)'].push(r.number);
    else if (before.pass && !now.pass) changes['НОВЫЕ ПРОВАЛЫ'].push(r.number);
    else if (!before.pass && now.pass) changes['ИСПРАВЛЕНО'].push(r.number);
    else changes['БЕЗ ИЗМЕНЕНИЙ'].push(r.number);
  }
  console.log(`\nСравнение с базовой линией от ${baseline.at.slice(0, 10)} (${baseline.via}):`);
  for (const [name, list] of Object.entries(changes)) {
    console.log(`  ${name}: ${list.length}${list.length && name !== 'БЕЗ ИЗМЕНЕНИЙ' ? ` (№ ${list.join(', ')})` : ''}`);
  }
}
// A hard gate failed: the run fails, so whatever runs it sees it.
if (hard.length) process.exitCode = 1;
