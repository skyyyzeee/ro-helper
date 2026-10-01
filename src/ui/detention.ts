// «Разбор задержания» (issue #4): after a detention the officer tells, in their own words, what they did, step by
// step, and gets each step checked against the server's laws — done right, a violation, or nothing in the laws —
// what was missed, and a summary: self-study for the academy. Nothing is recorded: the officer tells it themselves
// (typed, or with 🎤), so no other player's voice is ever taken.
import { useCallback, useState } from 'react';
import { findForSituation, type SearchHit, type ServerPack } from '../core';
import { coreRules, groundItems, idsOf, labelSources, packInScope, playerData, sourcesBlock, textIssues, type Source } from '../protocol';
import type { PlatformAdapter } from '../platform/types';
import { AiError, SOURCES, ask, connect, lawTerms } from './ai';

export type StepVerdict = 'ok' | 'violation' | 'unclear';

export interface DetentionStep {
  /** What the officer did, as the AI understood it. */
  step: string;
  verdict: StepVerdict;
  /** The article it is weighed by, as the sources label it. */
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

const PROMPT = (pack: ServerPack) =>
  [
    coreRules(pack, 'law'),
    'ЗАДАЧА: ты — наставник академии.',
    'Сотрудник рассказывает, как он провёл задержание (арест): что делал и в каком порядке. Разбери КАЖДЫЙ его шаг отдельно по источникам ниже: сделано ли это по закону. Затем назови, что по закону нужно было сделать, но в рассказе этого нет.',
    'БУДЬ ЧЕСТЕН И СПОКОЕН: это самопроверка для обучения. Верно сделанное так и отмечай — не ищи нарушений там, где их нет. Нарушение отмечай только если статья из источников прямо говорит иначе.',
    'СТРОГИЕ ПРАВИЛА: опирайся только на статьи из источников и ссылайся на них в точности как они подписаны (например «УПК ст. 50»). Никаких законов РФ. Не придумывай статей, прав и сроков, которых нет в источниках. Если про шаг в источниках ничего нет — verdict "unclear". У каждого шага и каждого пункта «missed» — "sources": id источников, на которых стоит вывод; без них вывод засчитан не будет. В «missed» — только то, чего прямо требует статья из источников. СРОКИ СРАВНИВАЙ ЧИСЛАМИ. Не пиши в тексте слова verdict, basis, fix и не рассуждай вслух.',
    'ПИШИ КОРОТКО: «step» — 3–8 слов; «basis» — одна статья и одно предложение до 25 слов, что в ней сказано по этому шагу; «fix» — одно предложение до 20 слов, как надо было, или пустая строка, если сделано верно; «summary» — до 20 слов, главный вывод.',
    'Ответь JSON: {"steps": [{"step": "что сделал сотрудник", "verdict": "ok" | "violation" | "unclear", "basis": "УПК ст. 26 — что в ней сказано", "fix": "как надо было", "sources": ["S3"]}], "missed": [{"what": "что не сделано", "basis": "УПК ст. 27 — что в ней сказано", "sources": ["S4"]}], "summary": "вывод"}.',
  ].join('\n\n');

const VERDICTS = new Set<StepVerdict>(['ok', 'violation', 'unclear']);

/** Text the AI echoed from its instructions instead of about the case. */
const echoed = (text: string) => /\b(verdict|basis|fix|steps|missed|summary)\b/i.test(text);

/**
 * A step judged right or a violation, or a missed duty, must rest on a source it names that was given — a law or a
 * charter — and its text may name no other article: otherwise it is not the server's law speaking, so a step is
 * shown as «nothing in the laws» and a missed duty is dropped — never a violation the officer did not commit.
 */
export function grounded(steps: DetentionStep[], missed: MissedStep[], sources: Source[]): { steps: DetentionStep[]; missed: MissedStep[] } {
  const stands = (sourcesOk: Source[], text: string) => sourcesOk.length > 0 && !textIssues(text, sources).length;
  return {
    steps: groundItems(steps, sources, 'law').map(({ item, sources: ok }) =>
      item.verdict !== 'unclear' && !stands(ok, `${item.basis} ${item.fix}`) ? { ...item, verdict: 'unclear' as const, fix: '' } : item,
    ),
    missed: groundItems(missed, sources, 'law').filter(({ item, sources: ok }) => stands(ok, item.basis)).map(({ item }) => item),
  };
}

export interface DetentionCheck {
  busy: boolean;
  result: DetentionReview | null;
  error: string | null;
  review: (said: string) => Promise<void>;
  reset: () => void;
}

export function useDetentionReview(platform: PlatformAdapter, pack: ServerPack, boostDocuments?: string[]): DetentionCheck {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DetentionReview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const review = useCallback(
    async (said: string) => {
      const text = said.trim();
      if (!text || busy) return;
      setBusy(true);
      setError(null);
      try {
        const key = await connect(platform);
        // The officer's own steps, and the order of a detention in the words of the law.
        const terms = await lawTerms(key, `Сотрудник провёл задержание и рассказывает, что делал: ${text}`);
        // The laws and charters only: how a detention goes is in them, not in the rules of the server.
        const sources = labelSources(
          findForSituation(packInScope(pack, 'law'), `${text} задержание задержанный права протокол`, { boostDocuments, lawTerms: terms, limit: SOURCES }),
        );
        if (!sources.length) throw new AiError('В законах сервера не нашлось статей о задержании — проверить не по чему.');
        const raw = await ask(
          key,
          PROMPT(pack),
          [{ role: 'user', parts: [{ text: `Как прошло задержание (со слов сотрудника).\n${playerData(text)}\n\n${sourcesBlock(sources)}` }] }],
          true,
          true,
          // Each step against the law, with its terms and times: the model needs to think.
          true,
        );
        const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|```\s*$/g, '')) as {
          steps?: Partial<DetentionStep>[];
          missed?: Partial<MissedStep>[];
          summary?: string;
        };
        const steps = (parsed.steps ?? [])
          .filter((s) => s.step)
          .map((s) => ({
            step: s.step!,
            verdict: VERDICTS.has(s.verdict as StepVerdict) ? (s.verdict as StepVerdict) : 'unclear',
            basis: s.basis ?? '',
            fix: s.verdict === 'ok' ? '' : (s.fix ?? ''),
            sources: idsOf(s.sources),
          }));
        if (!steps.length) throw new AiError('ИИ не разобрал шаги — расскажите подробнее, что вы делали и в каком порядке.');
        const missed = (parsed.missed ?? []).filter((m) => m.what).map((m) => ({ what: m.what!, basis: m.basis ?? '', sources: idsOf(m.sources) }));
        const summary = parsed.summary?.trim() ?? '';
        setResult({ said: text, ...grounded(steps, missed, sources), summary: echoed(summary) ? '' : summary, sources: sources.map((source) => source.hit) });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [busy, platform, pack, boostDocuments],
  );

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { busy, result, error, review, reset };
}
