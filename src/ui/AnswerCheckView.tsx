import type { AnswerCheck, Source } from '../protocol';
import { ANSWER_VERDICTS, POINT_VERDICTS } from './ai';
import { shortLabel } from './AiView';
import { WarnIcon } from './icons';
import type { SearchHit } from '../core';

const POINT_CLASS = { matches: 'status--confirmed', contradicts: 'status--not-found', unconfirmed: 'status--clarify' } as const;
const VERDICT_CLASS = { right: 'status--confirmed', partly: 'status--likely', wrong: 'status--not-found', unconfirmed: 'status--clarify' } as const;

/**
 * The player's answer weighed against the base (roadmap 6Б): the whole — the app's word — then each point with its
 * verdict, why, the articles it stands on, and what to change. A point the checks did not let stand says why.
 */
export function AnswerCheckView({ check, onOpen }: { check: AnswerCheck; onOpen: (hit: SearchHit) => void }) {
  const byId = new Map<string, Source>(check.sources.map((s) => [s.id, s]));
  return (
    <div className="check" aria-label="Проверка ответа">
      <span className={`status ${VERDICT_CLASS[check.verdict]}`}>{ANSWER_VERDICTS[check.verdict]}</span>
      <ul className="check__points">
        {check.points.map((point, i) => (
          <li key={i} className="check__point">
            <div className="check__top">
              <span className={`status ${POINT_CLASS[point.verdict]}`}>{POINT_VERDICTS[point.verdict]}</span>
              <b>{point.point}</b>
            </div>
            {point.why && <p className="check__why">{point.why}</p>}
            {point.sources.length > 0 && (
              <div className="ai__chips">
                {point.sources.flatMap((id) => byId.get(id) ?? []).map((source) => (
                  <button key={source.id} type="button" className="ai__chip" onClick={() => onOpen(source.hit)}>
                    {shortLabel(source.hit)}
                  </button>
                ))}
              </div>
            )}
            {point.fix && point.verdict !== 'matches' && <p className="check__fix">Изменить: {point.fix}</p>}
          </li>
        ))}
      </ul>
      {check.fix && <p className="check__fix"><b>Что изменить:</b> {check.fix}</p>}
      {check.issues.length > 0 && (
        <div className="warn">
          <WarnIcon />
          <span>Не всё подтвердилось по базе: {check.issues.join('; ')}</span>
        </div>
      )}
    </div>
  );
}
