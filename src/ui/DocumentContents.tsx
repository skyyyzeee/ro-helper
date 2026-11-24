import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { chapterHeading, type ChapterContents, type LawDocument, type SearchHit } from '../core';
import { ChevronLeftIcon, ChevronRightIcon } from './icons';
import { formatDate } from './lawBits';

interface DocumentContentsProps {
  document: LawDocument;
  groups: ChapterContents[];
  current: number;
  wide: boolean;
  countLabel: string;
  position: RefObject<{ id: string; top: number }>;
  onSelect: (index: number) => void;
  onOpen: () => void;
  row: (hit: SearchHit, index: number) => ReactNode;
  reader: ReactNode;
}

/** A law's outline stays beside its text; article navigation skips a repeated punished part. */
export function DocumentContents(props: DocumentContentsProps) {
  const { document, groups, current, wide, position } = props;
  const outline = useRef<HTMLDivElement>(null);
  const hits = groups.flatMap((group) => group.hits);
  const starts = groups.map((_, index) => groups.slice(0, index).reduce((sum, group) => sum + group.hits.length, 0));
  const selected = hits[current] ?? hits[0];
  const chapter = Math.max(groups.findIndex((group) => group.hits.includes(selected)), 0);
  const article = document.articles.findIndex((item) => item.id === selected?.article.id);
  const unit = document.unit === 'point' ? 'пункт' : 'статью';
  useLayoutEffect(() => {
    if (outline.current) {
      outline.current.scrollTop = current > 0 && position.current.id === document.id ? position.current.top : 0;
      outline.current.querySelector<HTMLElement>('.row--selected')?.scrollIntoView?.({ block: 'nearest' });
    }
    // Restore when opening or changing the layout, not on every selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document.id, wide]);

  const step = (direction: number) => {
    const target = document.articles[article + direction];
    const index = hits.findIndex((hit) => hit.article.id === target?.id);
    if (index >= 0) props.onSelect(index);
  };
  return (
    <div className={wide ? 'document-workspace document-workspace--wide' : 'document-workspace'}>
      <header className="document-workspace__head">
        <span className="document-workspace__title">{document.title}</span>
        <span>{props.countLabel}</span>
        <span className="document-workspace__date">Актуально на {formatDate(document.source.lastEdited)}</span>
      </header>
      <div className="document-workspace__index">
        {groups.length > 1 && (
          <label className="document-workspace__chapters">
            <span>Перейти к главе</span>
            <select aria-label="Перейти к главе" value={chapter} onChange={(event) => {
              const index = Number(event.target.value);
              props.onSelect(starts[index]);
              const target = outline.current?.querySelectorAll<HTMLElement>('.toc__chapter')[index];
              if (outline.current && target) outline.current.scrollTop = target.offsetTop;
            }}>
              {groups.map((group, index) => <option key={index} value={index}>{group.chapter ? chapterHeading(group.chapter) : 'Без главы'}</option>)}
            </select>
          </label>
        )}
        <div className="toc document-workspace__outline" aria-label={`Оглавление: ${document.title}`} ref={outline} onScroll={(event) => {
          position.current = { id: document.id, top: event.currentTarget.scrollTop };
        }}>
          {groups.map((group, index) => (
            <section key={`${index}-${group.chapter?.number ?? 'none'}`} className="toc__chapter" aria-label={group.chapter ? chapterHeading(group.chapter).replace(/\..*$/, '') : 'Без главы'}>
              {group.chapter && <h3 className="toc__title">{chapterHeading(group.chapter)}</h3>}
              <div className="list" role="list">{group.hits.map((hit, row) => props.row(hit, starts[index] + row))}</div>
            </section>
          ))}
        </div>
      </div>
      {wide && selected && (
        <section className="document-workspace__reading" aria-label="Текст выбранной статьи">
          <nav className="document-workspace__steps" aria-label="Переходы по документу">
            <button type="button" aria-label={document.unit === 'point' ? 'Предыдущий пункт' : 'Предыдущая статья'} disabled={article <= 0} onClick={() => step(-1)}><ChevronLeftIcon /></button>
            <span aria-label="Положение в документе">{article + 1} / {document.articles.length}</span>
            <button type="button" aria-label={document.unit === 'point' ? 'Следующий пункт' : 'Следующая статья'} disabled={article < 0 || article >= document.articles.length - 1} onClick={() => step(1)}><ChevronRightIcon /></button>
            <button className="document-workspace__expand" type="button" onClick={props.onOpen}>Открыть {unit} отдельно</button>
          </nav>
          <div className="document-workspace__text" key={`${selected.article.id}-${selected.part?.number ?? ''}`}>{props.reader}</div>
        </section>
      )}
    </div>
  );
}
