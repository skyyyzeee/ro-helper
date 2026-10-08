import { SOURCE_TYPE_LABELS, type Analysis } from '../protocol';
import { PERSPECTIVES } from './ai';
import { shortLabel } from './AiView';

const SCOPES: Record<string, string> = { law: 'законы', server_rule: 'правила сервера', mixed: 'законы и правила' };

/**
 * For the admin (`ai.debug`): how the answer came about — what the question was taken for, where and by which
 * words it was searched, what the AI saw, what the checks found. Nothing here is the AI's opinion of itself.
 */
export function DebugView({ analysis, classification }: { analysis: Analysis; classification?: { type: string; why: string } }) {
  const { validation } = analysis;
  return (
    <details className="ai__debug">
      <summary>Как ИИ пришёл к ответу</summary>
      <dl className="debug">
        {classification && (
          <>
            <dt>Вопрос</dt>
            <dd>
              {classification.type} — {classification.why}
            </dd>
          </>
        )}
        <dt>Где искал</dt>
        <dd>{SCOPES[analysis.scope] ?? analysis.scope}</dd>
        <dt>Слова поиска</dt>
        <dd>{analysis.terms?.length ? analysis.terms.join(' · ') : 'только слова вопроса'}</dd>
        <dt>Источники ({analysis.sources.length})</dt>
        <dd>
          <ul className="debug__list">
            {analysis.sources.map((source) => (
              <li key={source.id}>
                <b>{source.id}</b> {shortLabel(source.hit)} — {SOURCE_TYPE_LABELS[source.type].toLowerCase()}
              </li>
            ))}
          </ul>
        </dd>
        <dt>Проверки</dt>
        <dd>
          {validation.issues.length ? (
            <ul className="debug__list">
              {validation.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : (
            'всё прошло'
          )}
        </dd>
        {analysis.perspective && (
          <>
            <dt>Сторона</dt>
            <dd>
              {PERSPECTIVES.find((p) => p.id === analysis.perspective)?.label ?? analysis.perspective} · пунктов показано: {analysis.answer.guide?.length ?? 0}
              {analysis.hiddenGuide?.length ? `, скрыто: ${analysis.hiddenGuide.length}` : ''}
              {analysis.hiddenGuide?.length ? (
                <ul className="debug__list">
                  {analysis.hiddenGuide.map((point) => (
                    <li key={point.text}>
                      «{point.text}» — {point.why}
                    </li>
                  ))}
                </ul>
              ) : null}
            </dd>
          </>
        )}
        <dt>Итог</dt>
        <dd>
          {validation.status}
          {validation.needsReview ? ', требует проверки' : ''} · вызовов ИИ: {analysis.aiCalls ?? '—'}
        </dd>
      </dl>
    </details>
  );
}
