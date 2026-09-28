// The AI as the tests see it: the law terms for the search, then an analysis in the app's format that cites
// the first found article it is told to — the way a well-behaved model does.
import type { LegalAnswer } from '../protocol';

/** The analysis request, told from the law terms one by its instructions. */
export const isAnalysis = (system: string) => system.includes('Ответь ТОЛЬКО JSON-объектом');

/** The id and label of the found article the context lists under a label matching `wanted` (the first one by default). */
export function sourceIn(context: string, wanted = /\S+/): { id: string; ref: string } | null {
  for (const [, id, ref] of context.matchAll(/\[(S\d+)\] (\S+ (?:ст|п)\. [\d.]+)/g)) if (wanted.test(ref)) return { id, ref };
  return null;
}

/** An analysis of a stolen phone, citing УК ст. 65 when it was found, or saying nothing was. */
export function analysisOf(context: string, patch: Partial<LegalAnswer> = {}): string {
  const found = sourceIn(context, /^УК ст\. 65$/) ?? sourceIn(context);
  const answer: Partial<LegalAnswer> = {
    situation: 'Это кража телефона.',
    facts: ['у игрока украли телефон'],
    assumptions: [],
    norms: found ? [{ source: found.id, ref: found.ref, part: '1', why: 'тайное хищение чужого имущества', fit: 'direct', charge: true, stage: 'done' }] : [],
    violation: 'кража',
    punishment: 'штраф до 50 000 ₽ либо 30 мес',
    procedure: ['заявить в полицию'],
    uncertainty: [],
    questions: [],
    notFound: !found,
    ...patch,
  };
  return JSON.stringify(answer);
}

/** Gemini with a key: writes down a recording, gives the law terms, then the analysis. Every request is kept. */
export function fakeGeminiFetch(patch: Partial<LegalAnswer> = {}, bodies: string[] = []) {
  return async (_url: string, init: RequestInit) => {
    const raw = String(init.body);
    bodies.push(raw);
    const body = JSON.parse(raw) as { systemInstruction?: { parts: { text: string }[] }; contents: { parts: { text?: string }[] }[] };
    const system = body.systemInstruction?.parts[0]?.text ?? '';
    const context = body.contents.at(-1)?.parts.map((p) => p.text ?? '').join('\n') ?? '';
    const text = raw.includes('inlineData') ? 'у меня украли телефон' : isAnalysis(system) ? analysisOf(context, patch) : '["кража"]';
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });
  };
}
