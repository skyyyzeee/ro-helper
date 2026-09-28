// One question, end to end: the situation in the words of the law → search → the found articles under ids →
// the AI's structured analysis → the checks against the laws → the calculator. The AI takes part twice (the law
// terms, then the analysis); everything else is deterministic.
import { findForSituation, sourceLabel, type Charge, type DetentionResult, type Organization, type SearchHit, type ServerPack } from '../core';
import { AnswerFormatError, parseAnswer, type LegalAnswer } from './answer';
import { buildContext, labelSources, type CaseState, type Perspective, type Source } from './context';
import { analysisPrompt, type Depth } from './prompt';
import { AiError, type AiProvider } from './provider';
import { calculateCharges, validateAnswer, type Validation } from './validate';

/** Articles given to the AI for one question. */
export const SOURCES = 14;

const TERMS_PROMPT =
  'Игрок описал ситуацию на RP-сервере своими словами. Перескажи её 4–8 короткими поисковыми фразами (2–4 слова) на языке законов: юридические термины, названия правонарушений, участники, предметы («незаконное ношение оружия», «сокрытие лица», «неповиновение сотруднику полиции»). Первыми — само правонарушение, если оно есть (кража, грабёж, побои), потом участники и порядок действий. Не называй номеров статей и названий законов. Ответь только JSON: {"phrases": ["…", "…"]}.';

/** The situation in the words of the law, for the search; nothing when the AI could not say — the search still has the player's words. */
export async function lawTerms(provider: AiProvider, situation: string): Promise<string[]> {
  try {
    const text = await provider.complete({ system: TERMS_PROMPT, turns: [{ role: 'user', parts: [{ text: situation }] }], json: true, counts: false });
    const parsed: unknown = JSON.parse(text.trim().replace(/^```(?:json)?\s*|```\s*$/g, ''));
    // A service in JSON-object mode (the AI server) cannot answer with a bare array: it wraps it, {"phrases": […]}.
    const list = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' ? Object.values(parsed).find(Array.isArray) : undefined;
    return (list ?? []).filter((item: unknown): item is string => typeof item === 'string').slice(0, 10);
  } catch {
    return [];
  }
}

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
}

export interface Analysis {
  answer: LegalAnswer;
  sources: Source[];
  validation: Validation;
  /** The calculator's count for the charges found; null when none is a charge of a code it knows. */
  calculation: { charges: Charge[]; result: DetentionResult } | null;
  /** The case after this answer: what the next follow-up builds on. */
  case: CaseState;
}

export async function analyse(input: AnalyseInput): Promise<Analysis> {
  const { provider, pack, organization, message, previous, perspective, depth } = input;
  // A follow-up is searched with the facts it changes: «а если без маски» alone finds nothing.
  const searchText = previous ? `${previous.facts.join('. ')}\n${message}` : message;
  const terms = await lawTerms(provider, searchText);
  const search = (text: string) => findForSituation(pack, text, { boostDocuments: organization?.documents, lawTerms: terms, limit: SOURCES });
  const sources = labelSources(previous ? followUpHits(pack, previous, search(message), search(searchText)) : search(message));
  const context = buildContext({ pack, organization, message, sources, perspective, previous });
  const request = { system: analysisPrompt(pack, depth), turns: [{ role: 'user' as const, parts: [{ text: context }] }], json: true, think: depth === 'full' };

  let answer: LegalAnswer;
  try {
    answer = parseAnswer(await provider.complete(request));
  } catch (error) {
    if (!(error instanceof AnswerFormatError)) throw error;
    // Once more, reminded of the format; a second miss is told to the player — not shown as an answer.
    try {
      answer = parseAnswer(
        await provider.complete({ ...request, counts: false, system: `${request.system}\n\nПРОШЛЫЙ ОТВЕТ БЫЛ НЕ В ФОРМАТЕ. Ответь строго одним JSON-объектом по схеме.` }),
      );
    } catch (again) {
      if (again instanceof AnswerFormatError) throw new AiError('ИИ дважды ответил не в том формате. Попробуйте переформулировать вопрос.', 'format');
      throw again;
    }
  }

  const validation = validateAnswer(pack, sources, answer);
  const calculation = calculateCharges(pack, validation);
  const valid = validation.norms.filter((n) => n.hit && !n.issues.length);
  return {
    answer,
    sources,
    validation,
    calculation,
    case: {
      facts: answer.facts.length ? answer.facts : (previous?.facts ?? []),
      assumptions: answer.assumptions,
      norms: valid.map((n) => sourceLabel(n.hit!)),
      articles: [...new Set(valid.map((n) => n.hit!.article.id))],
      conclusion: answer.violation || answer.situation,
    },
  };
}
