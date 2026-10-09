import { useEffect, useState, type ReactNode } from 'react';
import { quizRound, type QuizQuestion, type SearchHit, type ServerPack } from '../core';
import { shortLabel } from './AiView';
import { CheckIcon, CloseIcon, SchoolIcon } from './icons';

/** Questions in a round of the quick tasks. */
export const QUIZ_ROUND = 10;

/**
 * «Быстрые задания» (roadmap 6А, ADR 0009): questions made from the server's laws themselves — the number of an
 * article, what it is about, what a part is punished with — four answers each, the right one the law's own. No AI,
 * nothing off the day's questions; a key 1–4 or a click answers. `picker` is the choice of documents, the AI's
 * practice's own.
 */
export function QuizView({ pack, documents, picker, onOpen }: { pack: ServerPack; documents: string[]; picker: ReactNode; onOpen: (hit: SearchHit) => void }) {
  const [round, setRound] = useState<QuizQuestion[] | null>(null);
  const [at, setAt] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);

  // Another server's laws or other documents: the round on show is of them no more.
  useEffect(() => {
    setRound(null);
    setDone(false);
  }, [pack, documents]);

  const start = () => {
    setRound(quizRound(pack, documents, QUIZ_ROUND));
    setAt(0);
    setPicked(null);
    setScore(0);
    setDone(false);
  };
  const question = round && !done ? round[at] : undefined;
  const pick = (option: number) => {
    if (!question || picked !== null) return;
    setPicked(option);
    if (option === question.answer) setScore((s) => s + 1);
  };
  const next = () => {
    if (!round) return;
    if (at + 1 >= round.length) setDone(true);
    else {
      setAt(at + 1);
      setPicked(null);
    }
  };

  // 1–4 answer, Enter goes on — over the game the hand stays on the keys.
  useEffect(() => {
    if (!question) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const n = Number(event.key);
      if (n >= 1 && n <= question.options.length) pick(n - 1);
      else if (event.key === 'Enter' && picked !== null) next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!round || done) {
    const asked = round?.length ?? QUIZ_ROUND;
    return (
      <>
        {done && round && (
          <div className="quiz__result" role="status">
            <b>
              Результат: {score} из {asked}
            </b>
            <span className="set__hint">
              {score >= asked * 0.8 ? 'Отлично знаете статьи.' : score >= asked / 2 ? 'Неплохо — откройте статьи, где ошиблись.' : 'Стоит ещё почитать законы и пройти заново.'}
            </span>
          </div>
        )}
        {round && !round.length && (
          <p className="set__hint" role="status">
            В этом документе нечего спросить: в нём нет названий статей и наказаний. Выберите кодекс или закон.
          </p>
        )}
        <div className="ai__intro ai__intro--tab quiz__intro">
          <span className="ai__hello-icon" aria-hidden="true">
            <SchoolIcon />
          </span>
          <h2 className="ai__hello">Быстрые задания</h2>
          <p className="set__hint">
            {QUIZ_ROUND} заданий по законам сервера: номер статьи, о чём она, какое наказание. Выберите ответ — мышкой или клавишами
            1–4. Без ИИ и без лимита вопросов.
          </p>
          {picker}
          <button className="btn btn--primary quiz__start" type="button" onClick={start}>
            {done ? 'Пройти ещё раз' : 'Начать'}
          </button>
        </div>
      </>
    );
  }

  if (!question) return null;
  const right = picked !== null && picked === question.answer;
  return (
    <>
      <div className="quiz__progress" aria-label={`Задание ${at + 1} из ${round.length}`}>
        <span>
          Задание {at + 1} из {round.length} · верно {score}
        </span>
        <span className="quiz__bar">
          <span style={{ width: `${((at + 1) / round.length) * 100}%` }} />
        </span>
      </div>
      <div className="quiz__question">{question.prompt}</div>
      <div className="quiz__options" role="group" aria-label="Варианты ответа">
        {question.options.map((option, i) => {
          const state = picked === null ? '' : i === question.answer ? ' quiz__option--right' : i === picked ? ' quiz__option--wrong' : '';
          return (
            <button key={option} type="button" className={`quiz__option${state}`} disabled={picked !== null} onClick={() => pick(i)}>
              <span className="quiz__key" aria-hidden="true">
                {i + 1}
              </span>
              {option}
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <div className={`quiz__verdict ${right ? 'quiz__verdict--right' : 'quiz__verdict--wrong'}`} role="status">
          <b>
            {right ? <CheckIcon size={15} /> : <CloseIcon size={15} />} {right ? 'Верно.' : `Неверно. Правильно: ${question.options[question.answer]}.`}
          </b>
          <p className="quiz__model">Статья целиком:</p>
          <button type="button" className="ai__cite" onClick={() => onOpen(question.hit)}>
            {shortLabel(question.hit)}
            {question.hit.article.title ? ` «${question.hit.article.title}»` : ''}
          </button>
        </div>
      )}
      {picked !== null && (
        <button className="btn btn--primary quiz__start" type="button" onClick={next}>
          {at + 1 >= round.length ? 'Итог' : 'Следующее задание'}
        </button>
      )}
    </>
  );
}
