import {
  articleHeading,
  articleLabel,
  articleText,
  articleTitle,
  diffWords,
  type ArticleChange,
  type ChangeEntry,
  type DocumentChange,
  type LawDocument,
  type ServerPack,
} from '../core';
import { ArrowRightIcon, BackIcon } from './icons';
import { formatDate } from './lawBits';

/** A change picked to look at: which update, which document, which article. */
export interface ChangeRef {
  entry: ChangeEntry;
  document: DocumentChange;
  change: ArticleChange;
}

const KIND_LABELS: Record<ArticleChange['kind'], string> = { changed: 'Изменено', added: 'Добавлено', removed: 'Удалено' };

/** A badge-like label for a document that may no longer be in the pack. */
function DocumentBadge({ short, document }: { short: string; document?: LawDocument }) {
  return <span className={`badge badge--${document?.category ?? 'codes'}`}>{short}</span>;
}

/** «Что изменилось»: the updates of the laws, newest first, by document, each article change openable. */
export function ChangesView({
  pack,
  entries,
  title,
  onOpen,
  onBack,
}: {
  pack: ServerPack;
  entries: ChangeEntry[];
  /** «С прошлого обновления» after an update, «За 60 дней» from the settings. */
  title: string;
  onOpen: (ref: ChangeRef) => void;
  onBack: () => void;
}) {
  const documentOf = (id: string) => pack.documents.find((d) => d.id === id);
  return (
    <section className="changes" aria-label="Что изменилось">
      <button className="back" type="button" onClick={onBack}>
        <BackIcon />
        <span>Назад</span>
      </button>
      <h2 className="changes__title">Что изменилось</h2>
      <p className="changes__sub">{title}</p>
      {entries.length === 0 && <div className="empty">Законы не менялись</div>}
      {entries.map((entry) => (
        <div key={entry.version} className="changes__entry">
          <div className="sec-t changes__date">Правки от {formatDate(entry.version)}</div>
          {entry.documents.map((document) => {
            const current = documentOf(document.documentId);
            return (
              <div key={document.documentId} className="changes__doc" role="group" aria-label={`${document.short} ${document.title}`}>
                <div className="changes__doc-head">
                  <DocumentBadge short={document.short} document={current} />
                  <span>{document.title}</span>
                </div>
                {document.kind !== 'changed' ? (
                  <p className="changes__whole">{document.kind === 'added' ? 'Добавлен документ' : 'Документ удалён'}</p>
                ) : (
                  <ul className="changes__list">
                    {document.articles.map((change) => {
                      const article = (change.after ?? change.before)!;
                      const label = articleLabel(article, undefined, current?.unit);
                      return (
                        <li key={change.articleId}>
                          <button type="button" className="changes__row" onClick={() => onOpen({ entry, document, change })}>
                            <span className={`chg chg--${change.kind}`}>{KIND_LABELS[change.kind]}</span>
                            <span className="num">{label}</span>
                            <span className="ttl">{articleTitle(article)}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}

/** One side of the comparison: the words it keeps, and the ones it lost or gained, marked. */
function Side({ words, show, label, className }: { words: ReturnType<typeof diffWords>; show: 'removed' | 'added'; label: string; className: string }) {
  return (
    <div className={`diff__col ${className}`} role="region" aria-label={label}>
      <div className="diff__label">{label}</div>
      <p className="diff__text">
        {words
          .filter((w) => w.kind === 'same' || w.kind === show)
          .map((w, i) => (w.kind === 'same' ? <span key={i}>{w.text}</span> : <mark key={i} className={`diff__${show}`}>{w.text}</mark>))}
      </p>
    </div>
  );
}

/** «Было → стало» for one article: the old text on the left, the new on the right, changed words marked. */
export function ChangeDiff({
  pack,
  target,
  backLabel,
  onBack,
  onOpenArticle,
}: {
  pack: ServerPack;
  target: ChangeRef;
  backLabel: string;
  onBack: () => void;
  /** Opens the article as it is now, when the laws still have it. */
  onOpenArticle?: () => void;
}) {
  const { entry, document, change } = target;
  const current = pack.documents.find((d) => d.id === document.documentId);
  const article = (change.after ?? change.before)!;
  const before = change.before ? articleText(change.before) : '';
  const after = change.after ? articleText(change.after) : '';
  const words = diffWords(before, after);
  const heading = articleHeading(article, current?.unit);

  return (
    <article className="art diff" aria-label={`Было → стало: ${heading}`}>
      <button className="back" type="button" onClick={onBack}>
        <BackIcon />
        <span>{backLabel}</span>
      </button>
      <div className="art__crumb">
        <DocumentBadge short={document.short} document={current} />
        <span>{document.title}</span>
      </div>
      <h2 className="art__title">{heading}</h2>
      <p className="diff__when">
        {KIND_LABELS[change.kind]} {formatDate(entry.version)}
      </p>
      <div className="diff__cols">
        {change.before ? <Side words={words} show="removed" label="Было" className="diff__col--before" /> : <div className="diff__col diff__col--before diff__col--empty">Статьи не было</div>}
        <span className="diff__arrow" aria-hidden="true">
          <ArrowRightIcon />
        </span>
        {change.after ? <Side words={words} show="added" label="Стало" className="diff__col--after" /> : <div className="diff__col diff__col--after diff__col--empty">Статья удалена</div>}
      </div>
      {onOpenArticle && (
        <button className="link" type="button" onClick={onOpenArticle}>
          Открыть статью целиком
        </button>
      )}
    </article>
  );
}
