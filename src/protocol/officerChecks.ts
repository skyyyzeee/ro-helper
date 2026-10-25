// «Проверка» for an officer, apart from the screens that show it, so the exam can ask it as a player does:
// «Требования адвоката» — each demand of a lawyer weighed against the laws; «Разбор задержания» — each step of a
// detention the officer tells, against the laws and the project's rules for the state's factions (ПГО: the charges
// and rights said aloud, no abuse of the state's functions). One AI call each: the search takes the officer's words
// with the hints and the words of the matter (hints.ts), not phrases asked of the AI first.
import { findForSituation, type SearchHit, type ServerPack } from '../core';
import { groundItems, idsOf, textIssues } from './check';
import { sourcesBlock } from './context';
import { hintTerms } from './hints';
import { SOURCES, alternate, withoutClaimedArticles } from './pipeline';
import { coreRules, playerData } from './prompt';
import { AiError, type AiProvider } from './provider';
import { labelSources, packInScope, type Source } from './sources';

// ——— Требования адвоката ———

export type Verdict = 'lawful' | 'unlawful' | 'partly' | 'unclear';

export interface Demand {
  /** The demand, as the AI understood it. */
  demand: string;
  verdict: Verdict;
  /** The article it rests on, as the sources label it. */
  basis: string;
  /** What the officer must do about it. */
  officer: string;
  /** On what grounds the officer may refuse; empty when a refusal would be unlawful. */
  refusal: string;
  /** The ids of the sources it stands on. */
  sources: string[];
}

export interface LawyerAnswer {
  said: string;
  demands: Demand[];
  /** What the officer can say to the lawyer, within the law. */
  reply: string;
  /** The gist, or a warning. */
  note: string;
  sources: SearchHit[];
  /** What the checks found wrong: a verdict with no source, an article none of the sources is. */
  issues: string[];
}

const LAWYER_PROMPT = (pack: ServerPack) =>
  [
    coreRules(pack, 'law'),
    'ЗАДАЧА: ты — независимый юрист.',
    'Сотрудник государственной организации (МВД, ФСБ и т.п.) пересказывает, что от него требует адвокат. Разбери КАЖДОЕ требование отдельно по источникам ниже.',
    'БУДЬ БЕСПРИСТРАСТЕН: ты не на стороне сотрудника и не на стороне адвоката. Если требование адвоката законно — прямо скажи это и что сотрудник ОБЯЗАН сделать; не ищи повода отказать. Если незаконно — назови основание для отказа. Если законно лишь частично — объясни, в какой части.',
    'СТРОГИЕ ПРАВИЛА: опирайся только на статьи из источников и ссылайся на них в точности как они подписаны (например «УПК ст. 50»). Никаких законов РФ. Не придумывай статей, прав и сроков, которых нет в источниках. Если по требованию в источниках ничего нет — verdict "unclear" и так и напиши. У каждого требования — "sources": id источников, на которых стоит вывод; без них verdict засчитан не будет.',
    'КАК РЕШАТЬ: сначала найди в источниках статью про это требование и прочитай, что в ней сказано, — потом ставь verdict, и он должен совпадать с этой статьёй. Если статья прямо даёт адвокату или задержанному это право — verdict "lawful", даже если сотруднику это неудобно. СРОКИ СРАВНИВАЙ ЧИСЛАМИ: если адвокат ссылается на время (например «прошло 30 минут»), а статья даёт больший срок (например 1 час = 60 минут), то срок НЕ истёк и требование на этом основании незаконно. Не пиши в тексте слово verdict и не рассуждай вслух.',
    'ПИШИ КОРОТКО: «basis» — одна статья и одно предложение (до 25 слов), что в ней сказано по этому требованию; «officer» и «refusal» — по одному предложению до 20 слов; «note» — до 12 слов.',
    '«reply» — ГОТОВАЯ ПРЯМАЯ РЕЧЬ сотрудника адвокату от первого лица, 2–4 предложения, вежливо и по делу, со ссылками на статьи, — её сразу говорят в игре. Начинай прямо с сути, без вступлений вроде «Сотрудник адвокату:». Если требование законно — сотрудник в ответе соглашается его выполнить.',
    'Ответь JSON: {"demands": [{"demand": "требование, 3–7 слов", "basis": "УПК ст. 26 — что в ней сказано", "verdict": "lawful" | "unlawful" | "partly" | "unclear", "officer": "что сотрудник должен сделать", "refusal": "на каком основании можно отказать, или пустая строка, если отказывать нельзя", "sources": ["S3"]}], "reply": "прямая речь сотрудника", "note": "вывод для сотрудника, например: Два требования выполнить, отпускать рано"}.',
  ].join('\n\n');

/** The words of a lawyer's demands in the laws: what a defender may ask, and what a detainee is owed. */
const LAWYER_TERMS = ['права защитника', 'адвокат защитник', 'права задержанного', 'срок задержания', 'ознакомление с протоколом'];

const LAWYER_VERDICTS = new Set<Verdict>(['lawful', 'unlawful', 'partly', 'unclear']);

/** The gist, unless the AI echoed its instructions into it instead. */
function aboutTheCase(note: string): string {
  return /\b(basis|verdict|reply|officer|refusal|demand)\b/i.test(note) ? '' : note.trim();
}

/** The reply as said in the game: without the «Сотрудник адвокату:» the AI sometimes puts before it, or quotes around it. */
export function spoken(reply: string): string {
  const said = reply
    .trim()
    .replace(/^(?:ответ\s+)?сотрудник[а-яё]*[^:«"\n]{0,40}:\s*/i, '')
    .replace(/^[«"]([\s\S]*)[»"]$/, '$1')
    .trim();
  return said.charAt(0).toUpperCase() + said.slice(1);
}

const json = (raw: string) => JSON.parse(raw.trim().replace(/^```(?:json)?\s*|```\s*$/g, '')) as Record<string, unknown>;

/** The hints for a text an officer tells of their own work: the officer is the one speaking, though rarely says so. */
const officerHints = (text: string) => hintTerms(`сотрудник ${text}`);

/** The laws' sources for what a lawyer demands: the laws and charters only — a lawyer's demand is no rule of the server. */
export function lawyerSources(pack: ServerPack, text: string, boostDocuments?: string[]): Source[] {
  return labelSources(
    findForSituation(packInScope(pack, 'law'), `${withoutClaimedArticles(text)} адвокат защитник`, { boostDocuments, lawTerms: [...officerHints(text), ...LAWYER_TERMS], limit: SOURCES }),
  );
}

/** Each demand of a lawyer, as an officer tells them, weighed against the laws — one AI call. */
export async function checkDemands(provider: AiProvider, pack: ServerPack, said: string, boostDocuments?: string[]): Promise<LawyerAnswer> {
  const text = said.trim();
  const found = lawyerSources(pack, text, boostDocuments);
  if (!found.length) throw new AiError('В законах сервера не нашлось статей по этим требованиям — проверить их не по чему.');
  const raw = await provider.complete({
    system: LAWYER_PROMPT(pack),
    turns: [{ role: 'user', parts: [{ text: `Что требует адвокат (со слов сотрудника).\n${playerData(text)}\n\n${sourcesBlock(found)}` }] }],
    json: true,
    // Weighing a demand against the law, with its terms and numbers, needs the model to think.
    think: true,
  });
  const parsed = json(raw) as { demands?: Partial<Demand>[]; reply?: string; note?: string };
  const told = (parsed.demands ?? [])
    .filter((d) => d.demand)
    .map((d) => ({
      demand: d.demand!,
      verdict: LAWYER_VERDICTS.has(d.verdict as Verdict) ? (d.verdict as Verdict) : 'unclear',
      basis: d.basis ?? '',
      officer: d.officer ?? '',
      refusal: d.refusal ?? '',
      sources: idsOf(d.sources),
    }));
  if (!told.length) throw new AiError('ИИ не разобрал требования — перескажите их подробнее.');
  // A verdict with no source given behind it is no verdict: «not found», and nothing to do or refuse on it.
  const issues: string[] = [];
  const demands = groundItems(told, found, 'law').map(({ item, sources, issues: wrong }) => {
    const stray = textIssues(`${item.basis} ${item.refusal}`, found);
    if (item.verdict === 'unclear' || (sources.length && !stray.length)) return item;
    issues.push(`«${item.demand}»: ${[...wrong, ...stray].join('; ')}`);
    return { ...item, verdict: 'unclear' as const, officer: '', refusal: '' };
  });
  const reply = spoken(parsed.reply ?? '');
  const replyIssues = textIssues(reply, found);
  if (replyIssues.length) issues.push(`Ответ адвокату: ${replyIssues.join('; ')}`);
  return { said: text, demands, reply, note: aboutTheCase(parsed.note ?? ''), sources: found.map((source) => source.hit), issues };
}

// ——— Разбор задержания ———

export type StepVerdict = 'ok' | 'violation' | 'unclear';

export interface DetentionStep {
  /** What the officer did, as the AI understood it. */
  step: string;
  verdict: StepVerdict;
  /** The article or rule it is weighed by, as the sources label it. */
  basis: string;
  /** How it should have been done; empty when it was done right. */
  fix: string;
  /** The ids of the sources it is weighed by. */
  sources: string[];
}

export interface MissedStep {
  what: string;
  basis: string;
  sources: string[];
}

export interface DetentionReview {
  said: string;
  steps: DetentionStep[];
  missed: MissedStep[];
  summary: string;
  sources: SearchHit[];
}

const DETENTION_PROMPT = (pack: ServerPack) =>
  [
    coreRules(pack, 'mixed'),
    'ЗАДАЧА: ты — наставник академии.',
    'Сотрудник рассказывает, как он провёл задержание (арест): что делал и в каком порядке. Разбери КАЖДЫЙ его шаг отдельно по источникам ниже: сделано ли это по закону и по правилам сервера для госструктур. Затем назови, что по ним нужно было сделать, но в рассказе этого нет.',
    'ПРАВИЛА ГОССТРУКТУР (R…) тоже обязательны для сотрудника: например, озвучить статьи и права в голосовой чат, не задерживать за маску или AFK-игроков, не выдавать максимум за мелочь. Нарушение такого правила — тоже "violation".',
    'БУДЬ ЧЕСТЕН И СПОКОЕН: это самопроверка для обучения. Верно сделанное так и отмечай — не ищи нарушений там, где их нет. Нарушение отмечай только если статья или правило из источников прямо говорит иначе.',
    'СТРОГИЕ ПРАВИЛА: опирайся только на источники и ссылайся на них в точности как они подписаны (например «УПК ст. 50»). Никаких законов РФ. Не придумывай статей, прав и сроков, которых нет в источниках. Если про шаг в источниках ничего нет — verdict "unclear". У каждого шага и каждого пункта «missed» — "sources": id источников, на которых стоит вывод; без них вывод засчитан не будет. В «missed» — только то, чего прямо требует источник. СРОКИ СРАВНИВАЙ ЧИСЛАМИ. Не пиши в тексте слова verdict, basis, fix и не рассуждай вслух.',
    'ПИШИ КОРОТКО: «step» — 3–8 слов; «basis» — один источник и одно предложение до 25 слов, что в нём сказано по этому шагу; «fix» — одно предложение до 20 слов, как надо было, или пустая строка, если сделано верно; «summary» — до 20 слов, главный вывод; в «missed» — не больше 3 самых важных пунктов.',
    'Ответь JSON: {"steps": [{"step": "что сделал сотрудник", "verdict": "ok" | "violation" | "unclear", "basis": "УПК ст. 26 — что в ней сказано", "fix": "как надо было", "sources": ["S3"]}], "missed": [{"what": "что не сделано", "basis": "УПК ст. 27 — что в ней сказано", "sources": ["S4"]}], "summary": "вывод"}.',
  ].join('\n\n');

/** The words of a detention's order in the laws and in the rules of the state's factions. */
const DETENTION_TERMS = ['порядок задержания', 'права задержанного', 'разъяснение прав задержанному', 'протокол задержания', 'личный досмотр', 'права и статьи озвучены в голосовой чат'];

const STEP_VERDICTS = new Set<StepVerdict>(['ok', 'violation', 'unclear']);

/** Text the AI echoed from its instructions instead of about the case. */
const echoed = (text: string) => /\b(verdict|basis|fix|steps|missed|summary)\b/i.test(text);

/**
 * A step judged right or a violation, or a missed duty, must rest on a source it names that was given — a law, a
 * charter or a rule of the state's factions — and its text may name no other article: otherwise it is not the
 * server's word speaking, so a step is shown as «nothing in the laws» and a missed duty is dropped — never a violation
 * the officer did not commit.
 */
export function grounded(steps: DetentionStep[], missed: MissedStep[], sources: Source[]): { steps: DetentionStep[]; missed: MissedStep[] } {
  const stands = (sourcesOk: Source[], text: string) => sourcesOk.length > 0 && !textIssues(text, sources).length;
  return {
    steps: groundItems(steps, sources, 'mixed').map(({ item, sources: ok }) =>
      item.verdict !== 'unclear' && !stands(ok, `${item.basis} ${item.fix}`) ? { ...item, verdict: 'unclear' as const, fix: '' } : item,
    ),
    missed: groundItems(missed, sources, 'mixed').filter(({ item, sources: ok }) => stands(ok, item.basis)).map(({ item }) => item),
  };
}

/** The sources of a detention told: the laws and the project's rules, taken in turn so neither crowds the other out. */
export function detentionSources(pack: ServerPack, text: string, boostDocuments?: string[]): Source[] {
  const asked = `${withoutClaimedArticles(text)} задержание задержанный права протокол`;
  const terms = [...officerHints(text), ...DETENTION_TERMS];
  const search = (scope: 'law' | 'server_rule') => findForSituation(packInScope(pack, scope), asked, { boostDocuments, lawTerms: terms, limit: SOURCES });
  return labelSources(alternate(search('law'), search('server_rule')).slice(0, SOURCES));
}

/** Each step of a detention, as the officer tells it, weighed against the laws and the rules — one AI call. */
export async function reviewDetention(provider: AiProvider, pack: ServerPack, said: string, boostDocuments?: string[]): Promise<DetentionReview> {
  const text = said.trim();
  const sources = detentionSources(pack, text, boostDocuments);
  if (!sources.length) throw new AiError('В законах сервера не нашлось статей о задержании — проверить не по чему.');
  const raw = await provider.complete({
    system: DETENTION_PROMPT(pack),
    turns: [{ role: 'user', parts: [{ text: `Как прошло задержание (со слов сотрудника).\n${playerData(text)}\n\n${sourcesBlock(sources)}` }] }],
    json: true,
    // Each step against the law, with its terms and times: the model needs to think.
    think: true,
  });
  const parsed = json(raw) as { steps?: Partial<DetentionStep>[]; missed?: Partial<MissedStep>[]; summary?: string };
  const steps = (parsed.steps ?? [])
    .filter((s) => s.step)
    .map((s) => ({
      step: s.step!,
      verdict: STEP_VERDICTS.has(s.verdict as StepVerdict) ? (s.verdict as StepVerdict) : 'unclear',
      basis: s.basis ?? '',
      fix: s.verdict === 'ok' ? '' : (s.fix ?? ''),
      sources: idsOf(s.sources),
    }));
  if (!steps.length) throw new AiError('ИИ не разобрал шаги — расскажите подробнее, что вы делали и в каком порядке.');
  const missed = (parsed.missed ?? []).filter((m) => m.what).map((m) => ({ what: m.what!, basis: m.basis ?? '', sources: idsOf(m.sources) }));
  const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
  return { said: text, ...grounded(steps, missed, sources), summary: echoed(summary) ? '' : summary, sources: sources.map((source) => source.hit) };
}
