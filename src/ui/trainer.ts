// The exam trainer: questions on the laws of the player's organisation, as in a faction's attestation. The app
// picks a real article of the server's laws; the AI only turns it into a question and checks the answer against
// that article's text — so a question never rests on a law the server does not have.
import { useCallback, useEffect, useState } from 'react';
import { articleText, sourceLabel, type LawDocument, type SearchHit, type ServerPack } from '../core';
import type { PlatformAdapter } from '../platform/types';
import { AiError, ask, connect } from './ai';

/** Questions in one round of the trainer. */
export const ROUND = 10;
/** An article too short to ask about — a heading, a reference — is passed over. */
const MIN_TEXT = 80;

export type Verdict = 'right' | 'partly' | 'wrong';

export interface TrainerQuestion {
  hit: SearchHit;
  question: string;
  /** What a full answer says, by the AI, from the article: shown after the player answers. */
  model: string;
}

export interface Graded {
  verdict: Verdict;
  feedback: string;
}

export type Phase = 'idle' | 'asking' | 'answering' | 'grading' | 'graded' | 'done';

export interface Trainer {
  /** Documents the questions come from. */
  documents: string[];
  setDocuments: (ids: string[]) => void;
  phase: Phase;
  /** 1-based number of the question on show. */
  number: number;
  /** Right answers count one, partly right a half. */
  score: number;
  question: TrainerQuestion | null;
  answer: string;
  graded: Graded | null;
  error: string | null;
  start: () => Promise<void>;
  reply: (text: string) => Promise<void>;
  next: () => Promise<void>;
}

const QUESTION_PROMPT =
  'Ты экзаменатор фракции на игровом RP-сервере Russia Online. По статье ниже составь ОДИН вопрос, какой задают на аттестации: о сути статьи, её условиях или о том, что должен сделать сотрудник. Не спрашивай номер статьи. Опирайся только на текст статьи. Ответь JSON: {"question": "вопрос", "answer": "полный правильный ответ в 1–3 предложениях по тексту статьи"}.';

const GRADE_PROMPT =
  'Ты экзаменатор фракции на игровом RP-сервере Russia Online. Сравни ответ игрока с текстом статьи и эталонным ответом. Засчитывай ответ по смыслу, своими словами — это нормально. Ответь JSON: {"verdict": "right" | "partly" | "wrong", "feedback": "1–2 предложения: что верно и что упущено, по тексту статьи"}. Обращайся к игроку на «вы».';

/** Documents to ask about when nothing is chosen: the organisation's own, else the penal code. */
export function defaultDocuments(pack: ServerPack, organisation?: string[]): string[] {
  const own = (organisation ?? []).filter((id) => pack.documents.some((d) => d.id === id));
  if (own.length) return own;
  const code = pack.calculator?.criminalCode ?? pack.documents.find((d) => d.kind === 'penal-code')?.id;
  return code ? [code] : pack.documents.slice(0, 1).map((d) => d.id);
}

/** A random article of the documents, with enough text to ask about, not asked already this round. */
export function pickArticle(documents: LawDocument[], asked: Set<string>, random = Math.random): SearchHit | undefined {
  const pool = documents.flatMap((document) =>
    document.articles.filter((a) => !asked.has(a.id) && articleText(a).length >= MIN_TEXT).map((article) => ({ article, document })),
  );
  return pool.length ? pool[Math.floor(random() * pool.length)] : undefined;
}

const parse = <T,>(text: string): T => JSON.parse(text.replace(/^```(?:json)?\s*|```\s*$/g, '')) as T;

export function useTrainer(platform: PlatformAdapter, pack: ServerPack, organisation?: string[]): Trainer {
  const [documents, setDocuments] = useState<string[]>(() => defaultDocuments(pack, organisation));
  const [phase, setPhase] = useState<Phase>('idle');
  const [number, setNumber] = useState(0);
  const [score, setScore] = useState(0);
  const [question, setQuestion] = useState<TrainerQuestion | null>(null);
  const [answer, setAnswer] = useState('');
  const [graded, setGraded] = useState<Graded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asked, setAsked] = useState<Set<string>>(new Set());

  // Another server, another organisation: the choice starts over.
  useEffect(() => {
    setDocuments(defaultDocuments(pack, organisation));
    setPhase('idle');
  }, [pack, organisation]);

  const key = useCallback(async () => {
    return connect(platform);
  }, [platform]);

  const ask1 = useCallback(
    async (count: number, before: Set<string>) => {
      setPhase('asking');
      setError(null);
      setGraded(null);
      setAnswer('');
      try {
        const docs = pack.documents.filter((d) => documents.includes(d.id));
        const hit = pickArticle(docs, before);
        if (!hit) throw new AiError('В выбранных документах не осталось статей для вопросов — выберите другие.');
        const made = parse<{ question?: string; answer?: string }>(
          await ask(
            await key(),
            QUESTION_PROMPT,
            [{ role: 'user', parts: [{ text: `### ${sourceLabel(hit)} — ${hit.document.title}\n${articleText(hit.article)}` }] }],
            true,
            // The trainer's calls are small: they do not take from the day's questions.
            false,
          ),
        );
        if (!made.question) throw new AiError('ИИ не придумал вопрос — попробуйте ещё раз.');
        setAsked(new Set([...before, hit.article.id]));
        setQuestion({ hit, question: made.question, model: made.answer ?? '' });
        setNumber(count);
        setPhase('answering');
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setPhase(count > 1 ? 'graded' : 'idle');
      }
    },
    [pack, documents, key],
  );

  const start = useCallback(async () => {
    setScore(0);
    await ask1(1, new Set());
  }, [ask1]);

  const reply = useCallback(
    async (text: string) => {
      const given = text.trim();
      if (!given || !question || phase !== 'answering') return;
      setAnswer(given);
      setPhase('grading');
      setError(null);
      try {
        const result = parse<{ verdict?: string; feedback?: string }>(
          await ask(
            await key(),
            GRADE_PROMPT,
            [
              {
                role: 'user',
                parts: [
                  {
                    text: `Статья: ### ${sourceLabel(question.hit)}\n${articleText(question.hit.article)}\n\nВопрос: ${question.question}\nЭталонный ответ: ${question.model}\nОтвет игрока: ${given}`,
                  },
                ],
              },
            ],
            true,
            false,
          ),
        );
        const verdict: Verdict = result.verdict === 'right' || result.verdict === 'partly' ? result.verdict : 'wrong';
        setGraded({ verdict, feedback: result.feedback ?? '' });
        setScore((s) => s + (verdict === 'right' ? 1 : verdict === 'partly' ? 0.5 : 0));
        setPhase('graded');
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setPhase('answering');
      }
    },
    [question, phase, key],
  );

  const next = useCallback(async () => {
    if (number >= ROUND) {
      setPhase('done');
      return;
    }
    await ask1(number + 1, asked);
  }, [number, asked, ask1]);

  return { documents, setDocuments, phase, number, score, question, answer, graded, error, start, reply, next };
}
