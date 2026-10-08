// One question, end to end:
//   question → classifier (no AI) → scope → search in the scope's documents only (no AI) → sources with their types
//   → the AI's structured analysis → the claim checks (no AI) → the calculator (no AI) → answer.
// What is no question of the base — a greeting, gibberish, the weather, the real laws, a bare article number — is
// answered by the app with no AI call. The AI's first call (search phrases) only adds words to the search: a source
// reaches the AI only if the search found it in the base.
import { findForSituation, searchArticles, sourceLabel, type Charge, type DetentionResult, type Organization, type SearchHit, type ServerPack } from '../core';
import { AnswerFormatError, parseAnswer, type LegalAnswer } from './answer';
import { aliasScope, matchAliases, type QueryAlias } from './aliases';
import { AI_INTENTS, classify, type Classification, type QuestionType } from './classify';
import { directPunishment } from './direct';
import { hintTerms } from './hints';
import { PERSPECTIVE_TERMS, buildContext, type CaseState, type Perspective } from './context';
import { analysisPrompt, type Depth } from './prompt';
import { AiError, type AiProvider } from './provider';
import { labelSources, packInScope, type Scope, type ScopeChoice, type Source } from './sources';
import { calculateCharges, groundedGuide, validateAnswer, type Validation } from './validate';

/** A message this short that finds nothing tells no situation: the player is asked to describe it. */
const VAGUE_WORDS = 6;
const VAGUE_QUESTION = { question: 'Опишите ситуацию подробнее: кто, что сделал, где это было?', options: [] as string[] };
const wordCount = (text: string) => (text.match(/[а-яёa-z0-9]+/gi) ?? []).length;

/** Articles given to the AI for one question. */
export const SOURCES = 14;
/** At most so many of the sources are the side's own law (context.ts PERSPECTIVE_TERMS). */
const SIDE_SOURCES = 3;

const TERMS_TASK: Record<Scope, string> = {
  law: 'на языке законов: юридические термины, названия правонарушений, участники, предметы («незаконное ношение оружия», «сокрытие лица», «неповиновение сотруднику полиции»). Первыми — само правонарушение, если оно есть (кража, грабёж, побои), названное термином закона, даже если игрок его не назвал: деньги сотруднику, чтобы отпустил, — «дача взятки»; не выполнил требование сотрудника — «неповиновение законному требованию»; пьяный за рулём — «управление в состоянии опьянения»; нашли оружие без лицензии — «незаконное хранение оружия». Сотрудник взял деньги — «получение взятки»; сотрудник избил задержанного — «превышение должностных полномочий»; ударил полицейского — «насилие в отношении представителя власти»; пообещал убить — «угроза убийством». Потом участники и порядок действий',
  server_rule: 'на языке правил игрового проекта: что запрещено или разрешено игроку (оскорбление родных, nonRP, DM, ограбление, захват, стороннее ПО), участники, организации',
  mixed: 'на языке законов и правил игрового проекта: правонарушение термином закона и, отдельно, что нарушено по правилам проекта',
};

function termsPrompt(scope: Scope, askIntent: boolean): string {
  const intent = askIntent
    ? ' Ещё определи, о чём вопрос: "legal" — о законах и правонарушениях в игре; "server_rule" — о правилах игрового проекта (nonRP, DM, наказания администрации); "mixed" — о том и другом; "out_of_scope" — не об игре (реальный мир, реальные законы РФ, новости, погода); "nonsense" — бессмыслица; "unclear" — непонятно. Ответь только JSON: {"intent": "…", "phrases": ["…", "…"]}.'
    : ' Ответь только JSON: {"phrases": ["…", "…"]}.';
  return `Игрок описал ситуацию на RP-сервере своими словами. Перескажи её 4–8 короткими поисковыми фразами (2–4 слова) ${TERMS_TASK[scope]}. Не называй номеров статей и названий документов.${intent}`;
}

/** The AI's search phrases, and — when the words could not tell — what it takes the question to be. */
export interface Terms {
  phrases: string[];
  intent?: QuestionType;
}

/**
 * The situation in the words of the base, for the search: phrases only — they are searched like the player's own
 * words and can bring up nothing the base does not have. Nothing when the AI could not say.
 */
export async function searchTerms(provider: AiProvider, situation: string, scope: Scope = 'law', askIntent = false, cache?: string): Promise<Terms> {
  try {
    const text = await provider.complete({ system: termsPrompt(scope, askIntent), turns: [{ role: 'user', parts: [{ text: situation }] }], json: true, counts: false, ...(cache ? { cache } : {}) });
    const parsed: unknown = JSON.parse(text.trim().replace(/^```(?:json)?\s*|```\s*$/g, ''));
    // A service in JSON-object mode (the AI server) cannot answer with a bare array: it wraps it, {"phrases": […]}.
    const object = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
    const list = Array.isArray(parsed) ? parsed : Array.isArray(object?.phrases) ? object.phrases : object ? Object.values(object).find(Array.isArray) : undefined;
    const intent = typeof object?.intent === 'string' && AI_INTENTS.has(object.intent) ? (object.intent as QuestionType) : undefined;
    return { phrases: (list ?? []).filter((item: unknown): item is string => typeof item === 'string').slice(0, 10), ...(intent ? { intent } : {}) };
  } catch {
    return { phrases: [] };
  }
}

/** The search phrases alone, in the words of the laws (the other AI modes use them). */
export const lawTerms = async (provider: AiProvider, situation: string): Promise<string[]> => (await searchTerms(provider, situation)).phrases;

/**
 * The sources of a follow-up: the articles the case already stands on (it is not analysed from scratch), then what
 * the change itself finds, then what the case with the change finds — each article once, a dozen or so in all.
 */
function followUpHits(pack: ServerPack, previous: CaseState, own: SearchHit[], withCase: SearchHit[]): SearchHit[] {
  const kept = (previous.articles ?? []).flatMap((id) => {
    const document = pack.documents.find((d) => d.articles.some((a) => a.id === id));
    const article = document?.articles.find((a) => a.id === id);
    return document && article ? [{ document, article }] : [];
  });
  const seen = new Set<string>();
  const merged: SearchHit[] = [];
  const queue = [...kept.slice(0, 4), ...own.flatMap((hit, i) => [hit, withCase[i]]).filter(Boolean), ...withCase];
  for (const hit of queue) {
    if (merged.length >= SOURCES || seen.has(hit.article.id)) continue;
    seen.add(hit.article.id);
    merged.push(hit);
  }
  return merged;
}

export interface AnalyseInput {
  provider: AiProvider;
  pack: ServerPack;
  organization?: Organization;
  message: string;
  previous?: CaseState;
  perspective?: Perspective;
  depth: Depth;
  /** Which documents may answer it; the laws when not said. */
  scope?: Scope;
  /** Search phrases already asked for (the classifier's call): not asked again. */
  terms?: string[];
  /**
   * The same case again, from another side: the message only asks for the side, it tells nothing — the sources are
   * the case's own and the side's words, not what «Разбери с точки зрения…» would find.
   */
  rerun?: boolean;
}

export interface Analysis {
  answer: LegalAnswer;
  sources: Source[];
  validation: Validation;
  /** The calculator's count for the charges found; null when none is a charge of a code it knows. */
  calculation: { charges: Charge[]; result: DetentionResult } | null;
  /** The case after this answer: what the next follow-up builds on. */
  case: CaseState;
  /** What the question was about. */
  scope: Scope;
  /** What the app says beside the answer: the question looks like the rules while the laws were chosen, say. */
  notes?: string[];
  /** The other kind of base the question looks like: offered as a button, to analyse it there. */
  switchTo?: 'law' | 'server_rule';
  /** How many AI calls it took — the exam and the debug view count them. */
  aiCalls?: number;
  /** The search phrases the AI gave, in the words of the base — for the debug view. */
  terms?: string[];
  /** The side the answer is for, its "guide" shaped for it. */
  perspective?: Perspective;
}

/** The analysis of a situation in a scope: sources from the base, the AI's answer, the checks, the calculator. */
export async function analyse(input: AnalyseInput): Promise<Analysis> {
  const { provider, pack, organization, message, previous, perspective, depth } = input;
  const scope = input.scope ?? previous?.scope ?? 'law';
  const inScope = packInScope(pack, scope);
  let aiCalls = 0;
  // A follow-up is searched with the facts it changes: «а если без маски» alone finds nothing. A side asked for is
  // the same case: its facts alone, and no AI call for phrases.
  const rerun = !!(input.rerun && previous);
  const searchText = previous ? (rerun ? previous.facts.join('. ') : `${previous.facts.join('. ')}\n${message}`) : message;
  let terms = input.terms ?? (rerun ? [] : undefined);
  if (!terms) {
    aiCalls += 1;
    terms = (await searchTerms(provider, searchText, scope, false, previous ? undefined : message)).phrases;
  }
  // The law's words for what the player told in everyday ones (hints.ts), beside the AI's: its miss is not the search's.
  const phrases = [...new Set([...hintTerms(searchText), ...terms])];
  const search = (text: string) => findForSituation(inScope, text, { boostDocuments: organization?.documents, lawTerms: phrases, limit: SOURCES });
  const found = previous ? followUpHits(inScope, previous, search(rerun ? searchText : message), search(searchText)) : search(message);
  // The side's own law — the rights of a detainee for the defence, an officer's duties — after the case's, never in
  // its place: a few articles that hold the side's words whole.
  const side = (perspective ? PERSPECTIVE_TERMS[perspective] : []).flatMap((words) =>
    searchArticles(inScope, `${words} `, { boostDocuments: organization?.documents, limit: 2 }).filter((hit) => hit.document.kind !== 'penal-code'),
  );
  const own = new Set(found.map((hit) => hit.article.id));
  const extra = side.filter((hit, i) => !own.has(hit.article.id) && side.findIndex((h) => h.article.id === hit.article.id) === i).slice(0, SIDE_SOURCES);
  const sources = labelSources([...found.slice(0, SOURCES - extra.length), ...extra.map(({ article, document }) => ({ article, document }))]);
  const context = buildContext({ pack, organization, message, sources, perspective, previous });
  // A first question may be answered again to anyone who asks it with the same laws (ADR 0007); a follow-up is its own case.
  const request = { system: analysisPrompt(pack, depth, scope, perspective), turns: [{ role: 'user' as const, parts: [{ text: context }] }], json: true, think: depth === 'full', ...(previous ? {} : { cache: message }) };

  let answer: LegalAnswer;
  try {
    aiCalls += 1;
    answer = parseAnswer(await provider.complete(request));
  } catch (error) {
    if (!(error instanceof AnswerFormatError)) throw error;
    // Once more, reminded of the format; a second miss is told to the player — not shown as an answer.
    try {
      aiCalls += 1;
      answer = parseAnswer(
        await provider.complete({ ...request, counts: false, system: `${request.system}\n\nПРОШЛЫЙ ОТВЕТ БЫЛ НЕ В ФОРМАТЕ. Ответь строго одним JSON-объектом по схеме.` }),
      );
    } catch (again) {
      if (again instanceof AnswerFormatError) throw new AiError('ИИ дважды ответил не в том формате. Попробуйте переформулировать вопрос.', 'format');
      throw again;
    }
  }

  const validation = validateAnswer(pack, sources, answer, scope);
  // The side's points are shown only where they stand on the sources: one that does not is left out, not flagged.
  if (answer.guide) {
    // Marks are the defence's check of the procedure: in a list of steps or rights they mean nothing.
    answer.guide = groundedGuide(answer.guide, sources, scope).map(({ mark, ...item }) => (perspective === 'lawyer' && mark ? { ...item, mark } : item));
  }
  // A side asked for and none of its points given (the model left the field out): its block is put together from
  // what the answer does say on the sources — the steps, what is broken, what it is punished with.
  if (perspective && !answer.guide?.length) {
    const said = (claim: LegalAnswer['violation'], lead: string) => (claim ? [{ ...claim, text: `${lead}${claim.text}` }] : []);
    const fallback =
      perspective === 'state'
        ? [...answer.procedure, ...said(answer.violation, 'Нарушение: '), ...said(answer.punishment, 'Наказание: ')]
        : perspective === 'lawyer'
          ? answer.procedure.map((step) => ({ ...step, mark: 'unknown' as const }))
          : [...said(answer.violation, 'Что вменяют: '), ...said(answer.punishment, 'Что грозит: '), ...answer.procedure];
    const grounded = groundedGuide(fallback, sources, scope);
    if (grounded.length) answer.guide = grounded;
  }
  // The side answered on the sources — the defence checking the procedure often names no norm of its own: that is
  // an answer to check, not «не найдено» over the very points that stand on the base.
  if (perspective && answer.guide?.length && validation.status === 'not-found') {
    validation.status = 'likely';
    answer.notFound = false;
  }
  // A label the AI miswrote over a source it gave is shown — and kept — under the source's own label.
  answer.norms = validation.norms.map((n) => n.norm);
  // Nothing found for a few words that tell no situation («чела приняли, что ему будет?»): not «не найдено» — the
  // player is asked what happened.
  if (!previous && validation.status === 'not-found' && wordCount(message) <= VAGUE_WORDS) {
    validation.status = 'clarify';
    if (!answer.questions.length) answer.questions = [VAGUE_QUESTION];
  }
  const calculation = calculateCharges(pack, validation);
  const valid = validation.norms.filter((n) => n.hit && !n.issues.length);
  return {
    answer,
    sources,
    validation,
    calculation,
    scope,
    aiCalls,
    terms,
    ...(perspective ? { perspective } : {}),
    case: {
      facts: answer.facts.length ? answer.facts : (previous?.facts ?? []),
      assumptions: answer.assumptions,
      norms: valid.map((n) => sourceLabel(n.hit!)),
      articles: [...new Set(valid.map((n) => n.hit!.article.id))],
      conclusion: answer.violation?.text || answer.situation,
      scope,
    },
  };
}

/** Why the app answered itself, with no AI analysis. */
export type SystemReason = 'greeting' | 'nonsense' | 'out_of_scope' | 'real_law' | 'article_lookup' | 'clarify_scope' | 'punishment';

/** An answer: the AI's analysis, or the app's own word. */
export type Outcome =
  | { kind: 'analysis'; analysis: Analysis; classification: Classification }
  | {
      kind: 'system';
      reason: SystemReason;
      text: string;
      classification: Classification;
      /** For an article number, or «что будет за кражу?»: the articles the base found, to open. */
      hits?: SearchHit[];
      /** For «закон или правила?»: the answers as buttons. */
      options?: { label: string; choice: ScopeChoice }[];
      aiCalls: number;
    };

const SYSTEM_TEXT: Record<SystemReason, string> = {
  greeting: 'Я работаю с законами, правилами и документами, загруженными в Кремлёвский Ассистент. Опишите ситуацию своими словами — найду нормы в базе вашего сервера и разберу её.',
  nonsense: 'Не понял вопрос. Опишите ситуацию из игры своими словами — например: «у меня украли телефон, что грозит вору?»',
  out_of_scope: 'Я работаю только с законами, правилами и документами, которые загружены в Кремлёвский Ассистент. На этот вопрос в них ответа нет.',
  real_law: 'Я не использую реальные законы РФ — только законы и правила вашего сервера, загруженные в Кремлёвский Ассистент.',
  article_lookup: 'Это номер статьи — вот что нашлось в базе. Откройте нужную.',
  clarify_scope: 'Уточните, вас интересует закон или правила сервера?',
  punishment: 'Вот что грозит по законам вашего сервера — ответ из базы, без ИИ и без лимита. Если важны обстоятельства (повторно, группой, при сотруднике), разберите ситуацию с ИИ.',
};

const MISMATCH_NOTE: Record<Scope, string> = {
  law: 'Вопрос похож на вопрос о законах, а выбран режим «Правила сервера» — разбор сделан только по правилам.',
  server_rule: 'Вопрос похож на вопрос о правилах сервера, а выбран режим «Законы» — разбор сделан только по законам.',
  mixed: '',
};

const RULES_HINT = 'Разбор сделан по законам сервера. Если вопрос о правилах сервера (nonRP, DM, наказания администрации) — выберите «Правила сервера».';

export interface QuestionInput extends Omit<AnalyseInput, 'scope' | 'terms'> {
  /** What the player chose over the AI: auto, the laws or the rules of the server. */
  choice?: ScopeChoice;
  /**
   * The players' expressions the admins approved: they help the search and the classifier, with no AI. Given as a
   * loader, it is asked only for a question that goes on to the search — the app's own answers need nothing.
   */
  aliases?: readonly QueryAlias[] | (() => Promise<readonly QueryAlias[]>);
  /** False to have the AI weigh even «что будет за кражу?», which the base answers alone by default. */
  direct?: boolean;
}

/**
 * A question from the player, whole: classified first; answered by the app when it is no question of the base;
 * otherwise analysed in its scope. A follow-up stays in its case's scope unless the player chose another.
 */
export async function answerQuestion(input: QuestionInput): Promise<Outcome> {
  const { pack, message, previous, provider } = input;
  const choice = input.choice ?? 'auto';
  const system = (reason: SystemReason, classification: Classification, extra: Partial<Extract<Outcome, { kind: 'system' }>> = {}, aiCalls = 0): Outcome => ({
    kind: 'system',
    reason,
    text: SYSTEM_TEXT[reason],
    classification,
    aiCalls,
    ...extra,
  });

  let classification = classify(pack, message, choice);
  // A follow-up («нет, он был сотрудником МВД») is read against its case: only what is plainly no question stops it.
  if (previous && !['out_of_scope', 'nonsense', 'greeting'].includes(classification.type)) {
    const scope = choice !== 'auto' ? choice : (previous.scope ?? 'law');
    classification = { type: scope === 'law' ? 'legal' : scope, scope, why: 'уточнение к делу' };
  }
  if (classification.type === 'greeting') return system('greeting', classification);
  if (classification.type === 'nonsense') return system('nonsense', classification);
  if (classification.type === 'out_of_scope') return system(/РФ/.test(classification.why) ? 'real_law' : 'out_of_scope', classification);
  if (classification.type === 'article_lookup') {
    // The search finds an article part by part: one button an article.
    const seen = new Set<string>();
    const hits = searchArticles(pack, `${message.trim()} `, { limit: 12 })
      .filter((hit) => !seen.has(hit.article.id) && seen.add(hit.article.id))
      .map(({ document, article }) => ({ document, article }))
      .slice(0, 3);
    return system('article_lookup', classification, { hits });
  }
  // «Что будет за кражу?»: the article that names the deed, with its punishment — the base's answer, no AI call.
  if (!previous && choice !== 'server_rule' && input.direct !== false) {
    const direct = directPunishment(pack, message, input.organization?.documents);
    if (direct) return system('punishment', { ...classification, why: `наказание за «${direct.subject}» — ответила база, без ИИ` }, { hits: direct.hits });
  }

  // An approved expression of the players: its normal form is the search phrases — no AI call for them — and its
  // scope settles what the words could not.
  const aliases = typeof input.aliases === 'function' ? await input.aliases().catch(() => []) : input.aliases;
  const matched = matchAliases(message, aliases);
  const known = aliasScope(matched);
  if (matched.length && classification.type === 'unclear' && choice === 'auto' && known) {
    classification = { type: known === 'law' ? 'legal' : 'server_rule', scope: known, why: `словарь игроков: «${matched[0].phrase}»` };
  }

  // Not told by the words: the AI's first call says what it is, and gives the search phrases at the same time.
  let terms: string[] | undefined = matched.length ? matched.map((alias) => alias.normalized) : undefined;
  let aiCalls = 0;
  if (classification.type === 'unclear') {
    aiCalls += 1;
    const asked = await searchTerms(provider, message, 'law', true, previous ? undefined : message);
    terms = [...(terms ?? []), ...asked.phrases];
    const intent = asked.intent;
    if (intent === 'out_of_scope') return system('out_of_scope', { type: 'out_of_scope', why: 'так решил ИИ' }, {}, aiCalls);
    if (intent === 'nonsense') return system('nonsense', { type: 'nonsense', why: 'так решил ИИ' }, {}, aiCalls);
    if (intent === 'legal' || intent === 'server_rule' || intent === 'mixed') {
      // No word of the rules of the server in it: the laws answer. The AI's guess that it is about the rules is
      // too often a crime it took for a game matter — said beside the answer instead, with the switch to the rules.
      classification = { type: 'legal', scope: 'law', why: 'слова не подсказали — так решил ИИ', ...(intent !== 'legal' ? { mismatch: 'server_rule' as const } : {}) };
    } else {
      return system('clarify_scope', classification, {
        options: [
          { label: 'Закон', choice: 'law' },
          { label: 'Правила сервера', choice: 'server_rule' },
        ],
      }, aiCalls);
    }
  }

  const scope = classification.scope ?? 'law';
  // The classifier's phrases were asked in the words of the laws: kept for an analysis in the laws. The players'
  // expressions are kept in any scope: they were approved for it.
  const keep = matched.length > 0 || scope === 'law';
  const analysis = await analyse({ ...input, scope, ...(terms && keep ? { terms } : {}) });
  analysis.aiCalls = (analysis.aiCalls ?? 0) + aiCalls;
  if (classification.mismatch && classification.mismatch !== 'mixed') analysis.switchTo = classification.mismatch;
  if (classification.mismatch) analysis.notes = [classification.why === 'слова не подсказали — так решил ИИ' ? RULES_HINT : MISMATCH_NOTE[classification.mismatch]];
  return { kind: 'analysis', analysis, classification };
}
