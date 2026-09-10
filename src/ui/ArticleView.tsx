import { formatPunishment, type Article, type LawDocument } from '../core';
import { usePlatform } from '../platform/PlatformContext';
import { BackIcon, ExternalIcon } from './icons';
import { DocBadge, JurisdictionPill, Stars, formatDate } from './lawBits';

export function ArticleView({ article, document, onBack }: { article: Article; document: LawDocument; onBack: () => void }) {
  const platform = usePlatform();
  const chapter = document.chapters.find((c) => c.number === article.chapter);

  return (
    <article className="art" aria-label={`Статья ${article.number}. ${article.title}`}>
      <button className="back" type="button" onClick={onBack}>
        <BackIcon />
        <span>Результаты</span>
      </button>
      <div className="art__crumb">
        <DocBadge document={document} />
        <span>{document.title}</span>
      </div>
      {chapter && (
        <div className="art__chapter">
          Глава {chapter.number}. {chapter.title}
        </div>
      )}
      <h2 className="art__title">
        Статья {article.number}. {article.title}
      </h2>

      <div className="art__parts">
        {article.parts.map((part, i) =>
          part.punishment || part.jurisdiction || part.stars ? (
            <section key={i} className="part-card">
              <div className="part-card__head">
                {part.number && <span className="part-card__num">ч. {part.number}</span>}
                <span className="sp" />
                {part.jurisdiction && <JurisdictionPill jurisdiction={part.jurisdiction} />}
                {part.stars && <Stars stars={part.stars} size={14} />}
              </div>
              <p className="part-card__text">{part.text}</p>
              {part.punishment && (
                <p className="part-card__pen">
                  {formatPunishment(part.punishment)}
                  {part.punishment.additional.map((extra) => ` + ${extra}`).join('')}
                </p>
              )}
            </section>
          ) : (
            <div key={i} className="part">
              {part.number && <span className="part__num">{part.number}.</span>}
              <div className="part__body">
                {part.text && <p>{part.text}</p>}
                {part.points.map((point) => (
                  <p key={point.letter} className="part__point">
                    {point.letter}) {point.text}
                  </p>
                ))}
              </div>
            </div>
          ),
        )}
      </div>

      {article.notes.map((note, i) => (
        <div key={i} className="note">
          <span className="note__label">{note.label}</span>
          <p>{note.text}</p>
        </div>
      ))}

      <div className="art__meta">
        <span>Актуально на {formatDate(document.source.lastEdited)}</span>
        <span>·</span>
        <button className="link" type="button" onClick={() => void platform.openExternal(document.source.url)}>
          Тема на форуме <ExternalIcon />
        </button>
      </div>
    </article>
  );
}
