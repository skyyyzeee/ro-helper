import { useState } from 'react';
import type { SearchHit, ServerPack } from '../core';
import { Dropdown } from './Dropdown';
import { AiHead, shortLabel, type AiTab } from './AiView';
import { CheckIcon, CloseIcon, SchoolIcon, WarnIcon } from './icons';
import { QuizView } from './QuizView';
import { ROUND, type Trainer, type Verdict } from './trainer';

const VERDICTS: Record<Verdict, { title: string; className: string }> = {
  right: { title: 'Верно', className: 'quiz__verdict--right' },
  partly: { title: 'Почти верно', className: 'quiz__verdict--partly' },
  wrong: { title: 'Неверно', className: 'quiz__verdict--wrong' },
};

/** «7 из 10», «6,5 из 10»: a half for a partly right answer. */
const scoreText = (score: number, of: number) => `${String(score).replace('.', ',')} из ${of}`;

/**
 * «Практика»: the quick tasks with no AI (roadmap 6А) — first, free and with no limit — and the exam with the AI:
 * questions on the laws of the organisation, one at a time, the answer given in the search field.
 */
export function TrainerView({
  trainer,
  pack,
  onOpen,
  onTab,
}: {
  trainer: Trainer;
  pack: ServerPack;
  onOpen: (hit: SearchHit) => void;
  onTab: (tab: AiTab) => void;
}) {
  const { phase, question, graded } = trainer;
  const chosen = pack.documents.filter((d) => trainer.documents.includes(d.id));
  const choosing = phase === 'idle' || phase === 'done';
  const [mode, setMode] = useState<'quick' | 'ai'>('quick');
  // While the AI's exam is under way, its questions stay on screen: the switch waits for its end.
  const busy = !choosing;
  const picker = (
    <div className="set__row quiz__docs">
      <span className="set__label">Вопросы по</span>
      <Dropdown
        className="quiz__select"
        label="Документ для вопросов"
        value={trainer.documents.length === 1 ? trainer.documents[0] : 'many'}
        onChange={(value) => value !== 'many' && trainer.setDocuments([value])}
        options={[
          ...(trainer.documents.length > 1 ? [{ value: 'many', lead: chosen.map((d) => d.short).join(', '), label: 'законы вашей организации' }] : []),
          ...pack.documents.map((d) => ({ value: d.id, lead: d.short, label: d.title })),
        ]}
      />
    </div>
  );

  return (
    <section className="art ai quiz" aria-label="Практика">
      <AiHead tab="trainer" onTab={onTab} />

      {!busy && (
        <div className="tabs quiz__modes" role="radiogroup" aria-label="Вид практики">
          {(
            [
              ['quick', 'Быстрые задания'],
              ['ai', 'Экзамен с ИИ'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={mode === id} className={mode === id ? 'tabs__btn tabs__btn--on' : 'tabs__btn'} onClick={() => setMode(id)}>
              {label}
            </button>
          ))}
        </div>
      )}

      {mode === 'quick' && !busy && <QuizView pack={pack} documents={trainer.documents} picker={picker} onOpen={onOpen} />}

      {mode === 'ai' && choosing && (
        <>
          {phase === 'done' && (
            <div className="quiz__result" role="status">
              <b>
                Результат: {scoreText(trainer.score, ROUND)}
              </b>
              <span className="set__hint">
                {trainer.score >= 8 ? 'Готовы к аттестации.' : trainer.score >= 5 ? 'Неплохо — повторите статьи, где ошиблись.' : 'Стоит ещё почитать законы и пройти заново.'}
              </span>
            </div>
          )}
          <div className="ai__intro ai__intro--tab quiz__intro">
            <span className="ai__hello-icon" aria-hidden="true">
              <SchoolIcon />
            </span>
            <h2 className="ai__hello">Готовы к аттестации?</h2>
            <p className="set__hint">
              {ROUND} вопросов по статьям законов сервера. Отвечайте своими словами в поле внизу или голосом — ИИ сверит ответ с
              текстом статьи и покажет, что упущено.
            </p>
            {picker}
            <button className="btn btn--primary quiz__start" type="button" onClick={() => void trainer.start()}>
              {phase === 'done' ? 'Пройти ещё раз' : 'Начать'}
            </button>
          </div>
        </>
      )}

      {mode === 'ai' && trainer.error && (
        <div className="warn" role="alert">
          <WarnIcon />
          <span>{trainer.error}</span>
        </div>
      )}

      {mode === 'ai' && !choosing && (
        <>
          <div className="quiz__progress" aria-label={`Вопрос ${trainer.number} из ${ROUND}`}>
            <span>
              Вопрос {trainer.number} из {ROUND} · верно {String(trainer.score).replace('.', ',')}
            </span>
            <span className="quiz__bar">
              <span style={{ width: `${(trainer.number / ROUND) * 100}%` }} />
            </span>
          </div>

          {phase === 'asking' && (
            <div className="ai__pending" role="status">
              <span className="ai__dots" aria-hidden="true" />
              Выбираю статью и составляю вопрос…
            </div>
          )}

          {question && phase !== 'asking' && (
            <>
              <div className="quiz__question">{question.question}</div>
              {trainer.answer && <div className="ai__question quiz__answer">{trainer.answer}</div>}
              {phase === 'answering' && !trainer.answer && <p className="set__hint">Напишите ответ в поле внизу и нажмите Enter.</p>}
              {phase === 'grading' && (
                <div className="ai__pending" role="status">
                  <span className="ai__dots" aria-hidden="true" />
                  Сверяю ответ со статьёй…
                </div>
              )}
              {graded && (
                <div className={`quiz__verdict ${VERDICTS[graded.verdict].className}`} role="status">
                  <b>
                    {graded.verdict === 'wrong' ? <CloseIcon size={15} /> : <CheckIcon size={15} />} {VERDICTS[graded.verdict].title}.
                  </b>{' '}
                  {graded.feedback}
                  {graded.unverified && <p className="quiz__model">В отзыве есть то, чего нет в тексте статьи, — сверьтесь со статьёй.</p>}
                  {question.model ? (
                    <p className="quiz__model">Полный ответ: {question.model}</p>
                  ) : (
                    <p className="quiz__model">Полный ответ — в тексте статьи:</p>
                  )}
                  <button type="button" className="ai__cite" onClick={() => onOpen(question.hit)}>
                    {shortLabel(question.hit)}
                    {question.hit.article.title ? ` «${question.hit.article.title}»` : ''}
                  </button>
                </div>
              )}
            </>
          )}

          {phase === 'graded' && (
            <button className="btn btn--primary quiz__start" type="button" onClick={() => void trainer.next()}>
              {trainer.number >= ROUND ? 'Итог' : 'Следующий вопрос'}
            </button>
          )}
        </>
      )}
    </section>
  );
}
