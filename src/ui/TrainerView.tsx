import type { SearchHit, ServerPack } from '../core';
import { AiTabs, shortLabel, type AiTab } from './AiView';
import { BackIcon, CheckIcon, CloseIcon, WarnIcon } from './icons';
import { ROUND, type Trainer, type Verdict } from './trainer';

const VERDICTS: Record<Verdict, { title: string; className: string }> = {
  right: { title: 'Верно', className: 'quiz__verdict--right' },
  partly: { title: 'Почти верно', className: 'quiz__verdict--partly' },
  wrong: { title: 'Неверно', className: 'quiz__verdict--wrong' },
};

/** «7 из 10», «6,5 из 10»: a half for a partly right answer. */
const scoreText = (score: number, of: number) => `${String(score).replace('.', ',')} из ${of}`;

/** «Тренажёр»: questions on the laws of the organisation, one at a time, the answer given in the search field. */
export function TrainerView({
  trainer,
  pack,
  backLabel,
  onBack,
  onOpen,
  onTab,
}: {
  trainer: Trainer;
  pack: ServerPack;
  backLabel: string;
  onBack: () => void;
  onOpen: (hit: SearchHit) => void;
  onTab: (tab: AiTab) => void;
}) {
  const { phase, question, graded } = trainer;
  const chosen = pack.documents.filter((d) => trainer.documents.includes(d.id));
  const choosing = phase === 'idle' || phase === 'done';

  return (
    <section className="art ai quiz" aria-label="Тренажёр">
      <div className="ai__top">
        <button className="back" type="button" onClick={onBack}>
          <BackIcon />
          <span>{backLabel}</span>
        </button>
      </div>
      <AiTabs tab="trainer" onTab={onTab} />

      {choosing && (
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
          <p className="set__hint">
            {ROUND} вопросов по статьям законов сервера — как на аттестации. Отвечайте своими словами в поле сверху (или голосом 🎤) —
            ИИ сверит ответ с текстом статьи и покажет, что упущено.
          </p>
          <label className="set__row quiz__docs">
            <span className="set__label">Вопросы по</span>
            <select
              className="quiz__select"
              aria-label="Документ для вопросов"
              value={trainer.documents.length === 1 ? trainer.documents[0] : 'many'}
              onChange={(e) => e.target.value !== 'many' && trainer.setDocuments([e.target.value])}
            >
              {trainer.documents.length > 1 && <option value="many">{chosen.map((d) => d.short).join(', ')} — законы вашей организации</option>}
              {pack.documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.short} — {d.title}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn--primary quiz__start" type="button" onClick={() => void trainer.start()}>
            {phase === 'done' ? 'Пройти ещё раз' : 'Начать'}
          </button>
        </>
      )}

      {trainer.error && (
        <div className="warn" role="alert">
          <WarnIcon />
          <span>{trainer.error}</span>
        </div>
      )}

      {!choosing && (
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
              {phase === 'answering' && !trainer.answer && <p className="set__hint">Напишите ответ в поле сверху и нажмите Enter.</p>}
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
                  {question.model && <p className="quiz__model">Полный ответ: {question.model}</p>}
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
