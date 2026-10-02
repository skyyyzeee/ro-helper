import type { CaseDiff } from '../protocol';

/**
 * «Было → стало» over an answer that changed the case (ADR 0003): its facts, its articles, the calculator's count
 * and the conclusion, compared with the answer before — by the app, not the AI. Compact: one line a change.
 */
export function CaseChange({ diff }: { diff: CaseDiff }) {
  const factChanged = diff.facts.length > 0;
  return (
    <div className="change" role="note" aria-label="Было → стало">
      <b className="change__head">{factChanged ? 'Изменён факт — связанные выводы пересчитаны' : 'Разбор пересмотрен'}</b>
      <ul className="change__list">
        {diff.facts.map((fact, i) => (
          <li key={`f${i}`}>
            {fact.was && fact.now ? (
              <>
                <s className="change__was">{fact.was}</s> → <span className="change__now">{fact.now}</span>
              </>
            ) : fact.now ? (
              <>
                + <span className="change__now">{fact.now}</span>
              </>
            ) : (
              <>
                − <s className="change__was">{fact.was}</s>
              </>
            )}
          </li>
        ))}
        {diff.norms.added.map((norm) => (
          <li key={`a${norm}`}>
            + статья <span className="change__now">{norm}</span>
          </li>
        ))}
        {diff.norms.removed.map((norm) => (
          <li key={`r${norm}`}>
            − статья <s className="change__was">{norm}</s>
          </li>
        ))}
        {diff.punishment && (
          <li>
            Наказание: <s className="change__was">{diff.punishment.was}</s> → <span className="change__now">{diff.punishment.now}</span>
          </li>
        )}
        {diff.conclusion && (
          <li>
            Вывод: <span className="change__now">{diff.conclusion.now}</span>
          </li>
        )}
      </ul>
    </div>
  );
}
