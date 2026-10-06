import { useState } from 'react';
import type { SearchHit } from '../core';
import { usePlatform } from '../platform/PlatformContext';
import { AiHead, citedIn, type AiTab } from './AiView';
import { AiIntro } from './AiIntro';
import { CheckIcon, TopicIcon, WarnIcon } from './icons';
import type { LawyerCheck, Verdict } from './lawyer';

const VERDICTS: Record<Verdict, { title: string; className: string }> = {
  lawful: { title: 'Законно — нужно выполнить', className: 'demand--lawful' },
  unlawful: { title: 'Незаконно — можно отказать', className: 'demand--unlawful' },
  partly: { title: 'Законно частично', className: 'demand--partly' },
  unclear: { title: 'В законах сервера не нашлось', className: 'demand--unclear' },
};

/** A text that names an article of the sources opens it; any other is plain. */
function Cited({ text, sources, onOpen }: { text: string; sources: SearchHit[]; onOpen: (hit: SearchHit) => void }) {
  const cited = citedIn(text, sources);
  return cited ? (
    <button type="button" className="ai__cite" title="Открыть статью" onClick={() => onOpen(cited)}>
      {text}
    </button>
  ) : (
    <>{text}</>
  );
}

/**
 * «Требования адвоката»: what a lawyer demands of an officer, weighed demand by demand against the server's laws,
 * with no side taken, and a reply the officer can give.
 */
export function LawyerView({
  lawyer,
  onOpen,
  onTab,
}: {
  lawyer: LawyerCheck;
  onOpen: (hit: SearchHit) => void;
  onTab: (tab: AiTab) => void;
}) {
  const platform = usePlatform();
  const [copied, setCopied] = useState(false);
  const result = lawyer.result;

  return (
    <section className="art ai lawyer" aria-label="Требования адвоката">
      <AiHead tab="lawyer" onTab={onTab} reset={result ? { label: 'Новая проверка', disabled: lawyer.busy, onClick: lawyer.reset } : undefined} />
      <div className="ai__chips" role="radiogroup" aria-label="Что проверить">
        {(
          [
            ['lawyer', 'Требования адвоката'],
            ['detention', 'Ход задержания'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" role="radio" aria-checked={id === 'lawyer'} className={id === 'lawyer' ? 'ai__chip ai__chip--on' : 'ai__chip'} onClick={() => id !== 'lawyer' && onTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {!result && !lawyer.busy && !lawyer.error && (
        <AiIntro
          icon={<TopicIcon id="rights" size={24} />}
          title="Что требует адвокат?"
          examples={['Адвокат требует свидание с задержанным наедине, копию протокола задержания и отпустить его, потому что прошло 30 минут']}
          onExample={(text) => void lawyer.check(text)}
        >
          Перескажите требования в поле внизу или голосом. ИИ проверит каждое по законам сервера: законно ли оно, что вы обязаны
          сделать и на каком основании можете отказать, — и подскажет, как ответить. Если адвокат прав, так и скажет.
        </AiIntro>
      )}

      {lawyer.busy && (
        <div className="ai__pending" role="status">
          <span className="ai__dots" aria-hidden="true" />
          Сверяю требования с законами…
        </div>
      )}

      {lawyer.error && (
        <div className="warn" role="alert">
          <WarnIcon />
          <span>{lawyer.error}</span>
        </div>
      )}

      {result && !lawyer.busy && (
        <>
          <p className="set__hint doc__situation">Требования: «{result.said}»</p>
          {result.note && <p className="quiz__question">{result.note}</p>}
          <ul className="demands">
            {result.demands.map((d, i) => (
              <li key={i} className={`demand ${VERDICTS[d.verdict].className}`}>
                <div className="demand__head">
                  <span className="demand__verdict">{VERDICTS[d.verdict].title}</span>
                  <b className="demand__what">{d.demand}</b>
                </div>
                {d.basis && (
                  <p className="demand__row">
                    <span className="demand__label">Основание:</span> <Cited text={d.basis} sources={result.sources} onOpen={onOpen} />
                  </p>
                )}
                {d.officer && (
                  <p className="demand__row">
                    <span className="demand__label">Что сделать:</span> {d.officer}
                  </p>
                )}
                {d.refusal && (
                  <p className="demand__row">
                    <span className="demand__label">Можно отказать:</span> <Cited text={d.refusal} sources={result.sources} onOpen={onOpen} />
                  </p>
                )}
              </li>
            ))}
          </ul>
          {result.issues.length > 0 && (
            <div className="warn" role="alert">
              <WarnIcon />
              <span>Не подтвердилось по законам сервера: {result.issues.join(' · ')}</span>
            </div>
          )}
          {result.reply && (
            <div className="lawyer__reply">
              <span className="demand__label">Как ответить адвокату</span>
              <p>{result.reply}</p>
              <button
                className="btn btn--primary doc__copy"
                type="button"
                onClick={() =>
                  void platform.writeClipboard(result.reply).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  })
                }
              >
                {copied ? (
                  <>
                    <CheckIcon size={16} /> Скопировано
                  </>
                ) : (
                  'Скопировать ответ'
                )}
              </button>
            </div>
          )}
          <p className="set__hint">ИИ может ошибиться: откройте статьи по ссылкам, прежде чем отказывать адвокату.</p>
        </>
      )}
    </section>
  );
}
