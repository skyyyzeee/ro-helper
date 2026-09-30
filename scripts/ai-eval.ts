// The AI's exam: situations from eval/cases.json, each asked the way a player asks it (law terms → search → the
// AI's analysis → the checks against the laws), and scored against the article that is the right answer. It tells
// the search's misses from the AI's, so a model or a prompt can be compared with another on the same questions.
//
//   npm run eval                                   — through the app's AI server (counts against its daily limits)
//   npm run eval -- --limit 3 --server tverskoi    — a few only
//   npm run eval -- --url https://openrouter.ai/api/v1 --model some/model   — any OpenAI-compatible AI;
//                                                    its key, if it needs one, in the AI_EVAL_KEY environment variable
//   --depth full                                   — the full analysis instead of the quick one
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ServerPack } from '../src/core';
import { AiError, analyse, openaiProvider, serverProvider, type AiProvider, type Depth } from '../src/protocol';

// about.ts reads the version Vite puts in at build time; outside Vite it is set here, before about.ts is loaded.
(globalThis as { __APP_VERSION__?: string }).__APP_VERSION__ = 'eval';
const { AI_SERVER } = await import('../src/ui/about');

interface Case {
  server: string;
  situation: string;
  /** «УК 65», or several right answers: «УК 10.1|УК 10.2». Every entry must be found. */
  expect: string[];
}

const root = join(import.meta.dirname, '..');
const args = process.argv.slice(2);
const arg = (name: string) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
};

const url = arg('url');
const model = arg('model');
if (url && !model) throw new Error('С --url нужен и --model.');
const provider: AiProvider = url
  ? openaiProvider({ url, model: model!, key: process.env.AI_EVAL_KEY ?? '' })
  : serverProvider(AI_SERVER, `deval${Math.random().toString(36).slice(2, 12)}`);
const via = url ? `${url} · ${model}` : `сервер ИИ ${AI_SERVER}`;
const depth = (arg('depth') ?? 'quick') as Depth;

const { cases: all } = JSON.parse(readFileSync(join(root, 'eval', 'cases.json'), 'utf8')) as { cases: Case[] };
const only = arg('server');
const cases = all.filter((c) => !only || c.server === only).slice(0, Number(arg('limit') ?? Infinity));

const packs = new Map<string, ServerPack>();
const pack = (id: string) => {
  if (!packs.has(id)) packs.set(id, JSON.parse(readFileSync(join(root, 'src', 'data', `${id}.json`), 'utf8')) as ServerPack);
  return packs.get(id)!;
};
/** «УК 65» for an article: the document's short name and the article's number. */
const ref = (hit: { document: { short: string }; article: { number: string } }) => `${hit.document.short} ${hit.article.number}`;
const matches = (wanted: string, refs: string[]) => wanted.split('|').some((one) => refs.includes(one.trim()));

type Mark = 'верно' | 'частично' | 'мимо' | 'ошибка';
const rows: { mark: Mark; searched: boolean; wrongCitations: number; seconds: number }[] = [];

console.log(`Экзамен ИИ: ${cases.length} ситуаций, ${depth === 'full' ? 'полный' : 'быстрый'} разбор, ${via}\n`);
for (const [i, c] of cases.entries()) {
  const started = Date.now();
  let mark: Mark = 'ошибка';
  let searched = false;
  let wrongCitations = 0;
  let detail = '';
  try {
    const result = await analyse({ provider, pack: pack(c.server), message: c.situation, depth });
    const sources = result.sources.map((s) => ref(s.hit));
    searched = c.expect.every((e) => matches(e, sources));
    const valid = result.validation.norms.filter((n) => n.hit && !n.issues.length);
    const direct = valid.filter((n) => n.norm.fit === 'direct').map((n) => ref(n.hit!));
    const cited = valid.map((n) => ref(n.hit!));
    wrongCitations = result.validation.norms.filter((n) => !n.hit || n.issues.length).length;
    mark = c.expect.every((e) => matches(e, direct)) ? 'верно' : c.expect.every((e) => matches(e, cited)) ? 'частично' : 'мимо';
    detail = `ИИ: ${direct.join(', ') || '—'}${cited.length > direct.length ? ` (ещё ${cited.filter((r) => !direct.includes(r)).join(', ')})` : ''}`;
    if (!searched) detail += ' · поиск не нашёл нужную статью';
    if (wrongCitations) detail += ` · не прошли проверку: ${result.validation.norms.flatMap((n) => (n.hit ? n.issues : n.issues.length ? n.issues : [n.norm.ref])).join('; ')}`;
  } catch (error) {
    detail = error instanceof AiError ? `${error.kind}: ${error.message}` : String(error);
  }
  const seconds = (Date.now() - started) / 1000;
  rows.push({ mark, searched, wrongCitations, seconds });
  const icon = { верно: '✓', частично: '½', мимо: '✗', ошибка: '!' }[mark];
  console.log(`${icon} ${String(i + 1).padStart(2)}. [${c.server}] ${c.situation}\n      нужно ${c.expect.join(', ')} → ${detail} · ${seconds.toFixed(1)} с`);
  // The server's per-IP limit counts requests: a pause keeps a long run from looking like a flood.
  if (!url) await new Promise((resolve) => setTimeout(resolve, 1500));
}

const count = (mark: Mark) => rows.filter((r) => r.mark === mark).length;
const score = count('верно') + count('частично') / 2;
const times = rows.map((r) => r.seconds).sort((a, b) => a - b);
console.log(
  [
    '',
    `Итог: ${score} из ${rows.length} (${Math.round((score / Math.max(rows.length, 1)) * 100)}%) — верно ${count('верно')}, частично ${count('частично')}, мимо ${count('мимо')}, ошибок ${count('ошибка')}`,
    `Поиск нашёл нужную статью: ${rows.filter((r) => r.searched).length} из ${rows.length}`,
    `Ссылок, не прошедших проверку по законам: ${rows.reduce((n, r) => n + r.wrongCitations, 0)}`,
    `Время ответа: медиана ${(times[Math.floor(times.length / 2)] ?? 0).toFixed(1)} с, худшее ${(times.at(-1) ?? 0).toFixed(1)} с`,
  ].join('\n'),
);
