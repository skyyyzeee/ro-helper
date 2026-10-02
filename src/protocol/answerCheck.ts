// «Проверить мой ответ» (roadmap 6Б): the player says what they would do and why, and gets each point of it weighed
// against the server's base — matches, contradicts, not confirmed — with what to change. The AI explains; whether a
// point stands is the checks': a verdict with no source given behind it is «not confirmed», and the overall verdict
// is the app's, from the points — the AI cannot call an answer right on its own word.
import { articleLabel, findForSituation, type Organization, type ServerPack } from '../core';
import { groundItems, idsOf, textIssues } from './check';
import { coreRules, playerData } from './prompt';
import type { AiProvider } from './provider';
import { AiError } from './provider';
import { searchTerms, SOURCES } from './pipeline';
import { sourcesBlock, type CaseState } from './context';
import { labelSources, packInScope, type Scope, type Source } from './sources';

export type PointVerdict = 'matches' | 'contradicts' | 'unconfirmed';

export interface AnswerPoint {
  /** The point of the player's answer, as the AI understood it. */
  point: string;
  verdict: PointVerdict;
  /** Why, in a sentence, from the source. */
  why: string;
  /** What to change, when it does not match. */
  fix: string;
  /** The ids of the sources it stands on. */
  sources: string[];
}

/** The answer as a whole — the app's word, from the points. */
export type AnswerVerdict = 'right' | 'partly' | 'wrong' | 'unconfirmed';

export interface AnswerCheck {
  answer: string;
  points: AnswerPoint[];
  verdict: AnswerVerdict;
  /** What to change, all told, in a sentence or two. */
  fix: string;
  sources: Source[];
  /** What the checks found wrong: a verdict with no source, an article or figure none of the sources holds. */
  issues: string[];
  aiCalls: number;
}

const VERDICTS = new Set<PointVerdict>(['matches', 'contradicts', 'unconfirmed']);

const prompt = (pack: ServerPack, scope: Scope) =>
  [
    coreRules(pack, scope),
    'ЗАДАЧА: игрок описал ситуацию и свой ответ — что бы он сделал и почему. Проверь его ответ по источникам ниже.',
    'Раздели ответ игрока на 1–5 пунктов (действие, статья, наказание, процедура, довод) — только то, что сказал сам игрок, ничего от себя не добавляй. По КАЖДОМУ: "matches" — источник прямо подтверждает пункт; "contradicts" — источник говорит иначе; "unconfirmed" — в источниках об этом ничего нет. У "matches" и "contradicts" обязательно "sources" — id источников, без них вердикт не засчитают.',
    'Не соглашайся с игроком из вежливости и не спорь ради спора: только то, что сказано в источниках. Номера статей, сроки и суммы в ответе игрока сверяй с источниками — игрок может ошибаться, его слова не источник.',
    'Не придирайся к тому, чего в источниках нет (следствие, формальности): если источник подтверждает статью или действие игрока — "matches". Вердикт и "why" должны совпадать: если источник говорит иначе, чем игрок, — это "contradicts", даже если часть пункта верна. В тексте не пиши id источников (S1, R2) — называй статьи так, как они подписаны. ПИШИ КОРОТКО: "why" — одно предложение до 25 слов, что сказано в источнике; "fix" — что изменить в пункте, одно предложение, или пустая строка, если пункт верен; общий "fix" — до двух предложений, что изменить в ответе в целом, или пустая строка.',
    'Ответь только JSON: {"points": [{"point": "пункт ответа, 3–10 слов", "verdict": "matches" | "contradicts" | "unconfirmed", "why": "…", "fix": "…", "sources": ["S2"]}], "fix": "…"}.',
  ].join('\n\n');

/** An explanation that says the point is wrong: «противоречит», «не соответствует», «неверно». */
const CONTRARY = /противореч|не\s+соответств|неверн|ошибочн|не\s+совпада|расходится/i;

/** The ids the AI wrote into its text, as the player knows the articles: «S1» → «УК ст. 87». */
function named(text: string, sources: Source[]): string {
  const byId = new Map(sources.map((s) => [s.id, s]));
  return text
    .replace(/\b([SRCO]\d+)\b/g, (id) => {
      const source = byId.get(id);
      return source ? `${source.hit.document.short} ${articleLabel(source.hit.article, undefined, source.hit.document.unit)}` : id;
    })
    // «УК S1» named becomes «УК УК ст. 87»: the document once.
    .replace(/(^|\s)(\S+)\s+\2(\s+(?:ст|п)\.)/g, '$1$2$3');
}

/** The words of a text that tell what it is about: four letters or more, by their first five. */
const stems = (text: string) => new Set((text.toLowerCase().replace(/ё/g, 'е').match(/[а-яa-z]{4,}|\d+(?:\.\d+)*/g) ?? []).map((w) => w.slice(0, 5)));

/** A point the player said: one sharing a word with their answer — not one the AI added of its own. */
function said(point: string, answer: string): boolean {
  const own = stems(answer);
  return [...stems(point)].some((stem) => own.has(stem));
}

/** The answer as a whole, from its points: right only when every point matches its sources. */
export function answerVerdict(points: AnswerPoint[]): AnswerVerdict {
  const matches = points.filter((p) => p.verdict === 'matches').length;
  const contradicts = points.filter((p) => p.verdict === 'contradicts').length;
  if (!points.length || (!matches && !contradicts)) return 'unconfirmed';
  if (contradicts) return matches ? 'partly' : 'wrong';
  return matches === points.length ? 'right' : 'partly';
}

export interface AnswerCheckInput {
  provider: AiProvider;
  pack: ServerPack;
  organization?: Organization;
  /** The situation: the case on show, or the player's own words. */
  situation: string;
  /** What the player would do, and why. */
  answer: string;
  /** The case it is about, when there is one: its facts are the situation's. */
  previous?: CaseState;
  scope?: Scope;
}

/** Weighs the player's answer against the base: search, the AI's points, the checks, the verdict. */
export async function checkMyAnswer(input: AnswerCheckInput): Promise<AnswerCheck> {
  const { provider, pack, organization, answer } = input;
  const scope = input.scope ?? input.previous?.scope ?? 'law';
  const situation = input.previous?.facts.length ? input.previous.facts.join('. ') : input.situation;
  const inScope = packInScope(pack, scope);
  const asked = `${situation}\n${answer}`;
  const terms = (await searchTerms(provider, asked, scope)).phrases;
  // The case's own articles first: the answer is about them.
  const kept = (input.previous?.articles ?? []).flatMap((id) => {
    const document = inScope.documents.find((d) => d.articles.some((a) => a.id === id));
    const article = document?.articles.find((a) => a.id === id);
    return document && article ? [{ document, article }] : [];
  });
  const found = findForSituation(inScope, asked, { boostDocuments: organization?.documents, lawTerms: terms, limit: SOURCES });
  const seen = new Set<string>();
  const sources = labelSources([...kept, ...found].filter((hit) => !seen.has(hit.article.id) && seen.add(hit.article.id)).slice(0, SOURCES));
  if (!sources.length) throw new AiError('В базе сервера не нашлось статей по этому ответу — проверить не по чему.');

  const raw = await provider.complete({
    system: prompt(pack, scope),
    turns: [{ role: 'user', parts: [{ text: `СИТУАЦИЯ:\n${playerData(situation)}\n\nОТВЕТ ИГРОКА:\n${playerData(answer)}\n\n${sourcesBlock(sources)}` }] }],
    json: true,
  });
  let parsed: { points?: Partial<AnswerPoint>[]; fix?: string };
  try {
    parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*|```\s*$/g, ''));
  } catch {
    throw new AiError('ИИ ответил не в том формате — попробуйте ещё раз.', 'format');
  }
  const told = (parsed.points ?? [])
    .filter((p) => typeof p.point === 'string' && p.point.trim())
    .slice(0, 6)
    .map((p) => ({
      point: p.point!.trim(),
      verdict: VERDICTS.has(p.verdict as PointVerdict) ? (p.verdict as PointVerdict) : 'unconfirmed',
      why: typeof p.why === 'string' ? p.why.trim() : '',
      fix: typeof p.fix === 'string' ? p.fix.trim() : '',
      sources: idsOf(p.sources),
    }));
  if (!told.length) throw new AiError('ИИ не разобрал ваш ответ — напишите его подробнее: что бы вы сделали и почему.');
  // Only what the player said is checked: a point the AI added of its own is left out.
  // Each point once: a model that repeats the whole answer as every point gives it once.
  const seenPoints = new Set<string>();
  const theirs = told.filter((p) => said(p.point, answer) && !seenPoints.has(p.point.toLowerCase()) && seenPoints.add(p.point.toLowerCase()));
  if (!theirs.length) throw new AiError('ИИ не разобрал ваш ответ — напишите его подробнее: что бы вы сделали и почему.');

  // A verdict stands only on a source it names, that was given, of the question's kind — and on no article or figure
  // its text holds that none of the sources does. Otherwise it is «not confirmed».
  const issues: string[] = [];
  const points = groundItems(theirs.map((p) => ({ ...p, why: named(p.why, sources), fix: named(p.fix, sources) })), sources, scope).map(({ item, sources: own, issues: wrong }) => {
    if (item.verdict === 'unconfirmed') return { ...item, sources: [] };
    const stray = textIssues(`${item.why} ${item.fix}`, own.length ? own : sources);
    // «Соответствует», while its own explanation says the opposite: the model contradicts itself — not confirmed.
    const against = item.verdict === 'matches' && CONTRARY.test(item.why) ? ['объяснение говорит обратное вердикту'] : [];
    if (own.length && !stray.length && !against.length) return item;
    issues.push(`«${item.point}»: ${[...wrong, ...stray, ...against].join('; ')}`);
    return { ...item, verdict: 'unconfirmed' as const, sources: [] };
  });
  const fix = typeof parsed.fix === 'string' ? named(parsed.fix.trim(), sources) : '';
  const fixIssues = textIssues(fix, sources);
  if (fixIssues.length) issues.push(`Что изменить: ${fixIssues.join('; ')}`);
  return { answer, points, verdict: answerVerdict(points), fix: fixIssues.length ? '' : fix, sources, issues, aiCalls: 2 };
}
