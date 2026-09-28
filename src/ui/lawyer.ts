// «Требования адвоката»: an officer tells what a lawyer demands, and gets each demand weighed against the server's
// laws — lawful or not, on what basis, what the officer must do or may refuse — and a reply to give. The AI is
// told to take no side: where the lawyer is right, it says so, and what the officer is bound to do.
import { useCallback, useState } from 'react';
import { findForSituation, sourcesText, type SearchHit, type ServerPack } from '../core';
import type { PlatformAdapter } from '../platform/types';
import { AiError, SOURCES, ask, connect, lawTerms } from './ai';

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
}

export interface LawyerAnswer {
  said: string;
  demands: Demand[];
  /** What the officer can say to the lawyer, within the law. */
  reply: string;
  /** The gist, or a warning. */
  note: string;
  sources: SearchHit[];
}

const PROMPT = (pack: ServerPack) =>
  [
    `Ты — независимый юрист на игровом RP-сервере Russia Online (GTA 5 RP), сервер «${pack.server.name}». Законы сервера вымышленные и не совпадают с законами РФ.`,
    'Сотрудник государственной организации (МВД, ФСБ и т.п.) пересказывает, что от него требует адвокат. Разбери КАЖДОЕ требование отдельно по источникам ниже.',
    'БУДЬ БЕСПРИСТРАСТЕН: ты не на стороне сотрудника и не на стороне адвоката. Если требование адвоката законно — прямо скажи это и что сотрудник ОБЯЗАН сделать; не ищи повода отказать. Если незаконно — назови основание для отказа. Если законно лишь частично — объясни, в какой части.',
    'СТРОГИЕ ПРАВИЛА: опирайся только на статьи из источников и ссылайся на них в точности как они подписаны (например «УПК ст. 50»). Никаких законов РФ. Не придумывай статей, прав и сроков, которых нет в источниках. Если по требованию в источниках ничего нет — verdict "unclear" и так и напиши.',
    'КАК РЕШАТЬ: сначала найди в источниках статью про это требование и прочитай, что в ней сказано, — потом ставь verdict, и он должен совпадать с этой статьёй. Если статья прямо даёт адвокату или задержанному это право — verdict "lawful", даже если сотруднику это неудобно. СРОКИ СРАВНИВАЙ ЧИСЛАМИ: если адвокат ссылается на время (например «прошло 30 минут»), а статья даёт больший срок (например 1 час = 60 минут), то срок НЕ истёк и требование на этом основании незаконно. Не пиши в тексте слово verdict и не рассуждай вслух.',
    'ПИШИ КОРОТКО: «basis» — одна статья и одно предложение (до 25 слов), что в ней сказано по этому требованию; «officer» и «refusal» — по одному предложению до 20 слов; «note» — до 12 слов.',
    '«reply» — ГОТОВАЯ ПРЯМАЯ РЕЧЬ сотрудника адвокату от первого лица, 2–4 предложения, вежливо и по делу, со ссылками на статьи, — её сразу говорят в игре. Начинай прямо с сути, без вступлений вроде «Сотрудник адвокату:». Если требование законно — сотрудник в ответе соглашается его выполнить.',
    'Ответь JSON: {"demands": [{"demand": "требование, 3–7 слов", "basis": "УПК ст. 26 — что в ней сказано", "verdict": "lawful" | "unlawful" | "partly" | "unclear", "officer": "что сотрудник должен сделать", "refusal": "на каком основании можно отказать, или пустая строка, если отказывать нельзя"}], "reply": "прямая речь сотрудника", "note": "вывод для сотрудника, например: Два требования выполнить, отпускать рано"}.',
  ].join('\n\n');

const VERDICTS = new Set<Verdict>(['lawful', 'unlawful', 'partly', 'unclear']);

/** The gist, unless the AI echoed its instructions into it instead. */
function aboutTheCase(note: string): string {
  return /(basis|verdict|reply|officer|refusal|demand)/i.test(note) ? '' : note.trim();
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

export interface LawyerCheck {
  busy: boolean;
  result: LawyerAnswer | null;
  error: string | null;
  check: (said: string) => Promise<void>;
  reset: () => void;
}

export function useLawyerCheck(platform: PlatformAdapter, pack: ServerPack, boostDocuments?: string[]): LawyerCheck {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LawyerAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(
    async (said: string) => {
      const text = said.trim();
      if (!text || busy) return;
      setBusy(true);
      setError(null);
      try {
        const key = await connect(platform);
        // The demands' own words, and the rights of a defender and the duties of an officer, in the words of the law.
        const terms = await lawTerms(key, `Адвокат (защитник) требует от сотрудника: ${text}`);
        const sources = findForSituation(pack, `${text} адвокат защитник`, { boostDocuments, lawTerms: terms, limit: SOURCES });
        if (!sources.length) throw new AiError('В законах сервера не нашлось статей по этим требованиям — проверить их не по чему.');
        const raw = await ask(
          key,
          PROMPT(pack),
          [{ role: 'user', parts: [{ text: `Что требует адвокат (со слов сотрудника): ${text}\n\nНайденные в законах сервера источники (используй только их):\n\n${sourcesText(sources)}` }] }],
          true,
          true,
          // Weighing a demand against the law, with its terms and numbers, needs the model to think.
          true,
        );
        const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|```\s*$/g, '')) as {
          demands?: Partial<Demand>[];
          reply?: string;
          note?: string;
        };
        const demands = (parsed.demands ?? [])
          .filter((d) => d.demand)
          .map((d) => ({
            demand: d.demand!,
            verdict: VERDICTS.has(d.verdict as Verdict) ? (d.verdict as Verdict) : 'unclear',
            basis: d.basis ?? '',
            officer: d.officer ?? '',
            refusal: d.refusal ?? '',
          }));
        if (!demands.length) throw new AiError('ИИ не разобрал требования — перескажите их подробнее.');
        setResult({ said: text, demands, reply: spoken(parsed.reply ?? ''), note: aboutTheCase(parsed.note ?? ''), sources });
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

  return { busy, result, error, check, reset };
}
