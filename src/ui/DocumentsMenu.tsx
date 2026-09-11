import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { DocumentCategory, LawDocument, Organization, ServerPack } from '../core';
import { CloseIcon, SearchIcon } from './icons';
import { DocBadge } from './lawBits';

/** Menu groups, in order. */
const CATEGORIES: Record<DocumentCategory, { group: string; tag: string }> = {
  codes: { group: 'Кодексы и Конституция', tag: 'Кодексы' },
  fkz: { group: 'Федеральные конституционные законы', tag: 'ФКЗ' },
  fz: { group: 'Федеральные законы', tag: 'ФЗ' },
  moscow: { group: 'Законы Москвы', tag: 'Москва' },
  charters: { group: 'Уставы организаций', tag: 'Уставы' },
  rules: { group: 'Правила проекта', tag: 'Правила' },
};

const normalize = (text: string) => text.toLowerCase().replace(/ё/g, 'е');

interface Group {
  title: string;
  documents: LawDocument[];
}

export interface DocumentsMenuProps {
  pack: ServerPack;
  organization?: Organization;
  /** The document the search is narrowed to. */
  current?: string;
  onPick: (document: LawDocument) => void;
  onClose: () => void;
}

/** Side menu with every document of the server: a filter, tags by kind, the user's organisation first. */
export function DocumentsMenu({ pack, organization, current, onPick, onClose }: DocumentsMenuProps) {
  const filterRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState('');
  const [tag, setTag] = useState<DocumentCategory | 'all'>('all');
  /** The row the keyboard is on; until moved, the current document (so fill and outline are on one row), else the first. */
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => filterRef.current?.focus(), []);

  // Tags only for kinds the pack has, so none leads to an empty list.
  const categories = (Object.keys(CATEGORIES) as DocumentCategory[]).filter((c) => pack.documents.some((d) => d.category === c));
  const groups = useMemo(() => {
    const words = normalize(filter.trim());
    const matches = (d: LawDocument) => (tag === 'all' || d.category === tag) && (!words || normalize(`${d.short} ${d.title}`).includes(words));
    const result: Group[] = [];
    const own = organization?.documents.map((id) => pack.documents.find((d) => d.id === id)).filter((d) => d !== undefined) ?? [];
    if (own.length && tag === 'all' && !words) result.push({ title: `${organization!.name} · ваша организация`, documents: own });
    for (const category of Object.keys(CATEGORIES) as DocumentCategory[]) {
      const documents = pack.documents.filter((d) => d.category === category && matches(d));
      if (documents.length) result.push({ title: CATEGORIES[category].group, documents });
    }
    return result;
  }, [pack, organization, filter, tag]);
  const rows = groups.flatMap((g) => g.documents);
  const active = Math.min(selected ?? Math.max(rows.findIndex((d) => d.id === current), 0), rows.length - 1);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.querySelector('.doc-row--selected')?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected(Math.min(active + 1, rows.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected(Math.max(active - 1, 0));
    } else if (e.key === 'Enter' && rows[active]) {
      e.preventDefault();
      onPick(rows[active]);
    }
  };

  let index = -1;
  // A document can be in two groups (the organisation's and its kind); only its first row is marked.
  const currentRow = rows.findIndex((d) => d.id === current);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="drawer" role="dialog" aria-label="Все документы">
        <div className="drawer__head">
          <span className="drawer__title">Все документы</span>
          <span className="sp" />
          <button className="icon-btn" type="button" aria-label="Закрыть меню" title="Закрыть" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <label className="drawer__filter">
          <SearchIcon />
          <input
            ref={filterRef}
            aria-label="Фильтр документов"
            placeholder="Фильтр документов"
            autoComplete="off"
            spellCheck={false}
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setSelected(null);
            }}
            onKeyDown={onKey}
          />
        </label>
        <div className="tags" role="group" aria-label="Виды документов">
          {(['all', ...categories] as const).map((c) => (
            <button
              key={c}
              type="button"
              className={tag === c ? 'tag tag--on' : 'tag'}
              aria-pressed={tag === c}
              onClick={() => {
                setTag(c);
                setSelected(null);
                filterRef.current?.focus();
              }}
            >
              {c === 'all' ? 'Все' : CATEGORIES[c].tag}
            </button>
          ))}
        </div>
        <div className="drawer__list" ref={listRef}>
          {groups.map((group) => (
            <div key={group.title} role="group" aria-label={group.title}>
              <div className="drawer__sec">{group.title}</div>
              {group.documents.map((document) => {
                const row = ++index;
                const className = ['doc-row', row === active && 'doc-row--selected', row === currentRow && 'doc-row--on'].filter(Boolean).join(' ');
                return (
                  <button
                    key={document.id}
                    type="button"
                    className={className}
                    aria-current={row === currentRow ? 'true' : undefined}
                    onMouseEnter={() => setSelected(row)}
                    onClick={() => onPick(document)}
                  >
                    <DocBadge document={document} />
                    <span className="doc-row__name">{document.title}</span>
                    <span className="doc-row__count">{document.articles.length}</span>
                  </button>
                );
              })}
            </div>
          ))}
          {rows.length === 0 && <div className="empty">Ничего не найдено</div>}
        </div>
      </div>
    </>
  );
}
