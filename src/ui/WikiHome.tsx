import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import { usePlatform } from '../platform/PlatformContext';
import { FRESH, type WikiBlock, type WikiCatalogId, type WikiChange, type WikiData, type WikiEntry } from '../wiki/model';
import { JobsBlock, type Earn } from './WikiTools';

/** The wiki's pages the player opened last, newest first: on this computer only, never sent or synced. */
export const WIKI_RECENT_KEY = 'wiki.recent';
const RECENT = 10;

/** The pages opened last, and a way to add one. */
export function useWikiRecent(data: WikiData | null): { recent: WikiEntry[]; remember: (entry: WikiEntry) => void } {
  const platform = usePlatform();
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    void platform.readSetting<string[]>(WIKI_RECENT_KEY).then((saved) => setIds(Array.isArray(saved) ? saved : []));
  }, [platform]);
  const remember = useCallback(
    (entry: WikiEntry) =>
      setIds((now) => {
        const next = [entry.id, ...now.filter((id) => id !== entry.id)].slice(0, RECENT);
        void platform.writeSetting(WIKI_RECENT_KEY, next);
        return next;
      }),
    [platform],
  );
  const byId = new Map(data?.entries.map((e) => [e.id, e]) ?? []);
  // A page the wiki no longer has is passed over.
  return { recent: ids.map((id) => byId.get(id)).filter((e): e is WikiEntry => !!e), remember };
}

/** The four groups of the wiki's catalogs on its home, as a player looks for things. */
const GROUPS: { title: string; catalogs: WikiCatalogId[] }[] = [
  { title: 'Транспорт', catalogs: ['vehicles', 'wheels', 'modkits'] },
  { title: 'Персонаж', catalogs: ['clothes', 'haircuts', 'tattoos', 'skins', 'animations'] },
  { title: 'Имущество', catalogs: ['realties', 'businesses'] },
  { title: 'Предметы и крафт', catalogs: ['items', 'recipes', 'crafts'] },
];

/** A group's picture: the newest thing of its first catalog with one — new on the wiki first. */
function pictureOf(data: WikiData, catalogs: WikiCatalogId[]): string | undefined {
  const own = data.entries.filter((e) => e.catalog === catalogs[0] && e.image && !/\.(webm|mp4)$/i.test(e.image));
  const fresh = own.filter((e) => e.tags.includes(FRESH));
  const newest = (list: WikiEntry[]) => [...list].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0];
  return (newest(fresh) ?? newest(own))?.image;
}

export const plural = (n: number, one: string, few: string, many: string) => {
  const ten = n % 10;
  const hundred = n % 100;
  return ten === 1 && hundred !== 11 ? one : ten >= 2 && ten <= 4 && (hundred < 12 || hundred > 14) ? few : many;
};

/** «2 мин чтения»: a page's words at some 180 a minute. */
export function readingTime(entry: WikiEntry): string {
  const words = (entry.text ?? '').split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / 180));
  return `${minutes} мин чтения`;
}

const CHANGES: { kind: WikiChange; label: string }[] = [
  { kind: 'added', label: 'добавлено' },
  { kind: 'changed', label: 'изменено' },
  { kind: 'fixed', label: 'исправлено' },
];

/** «добавлено 3 · изменено 1 · исправлено 15» as chips: what an update brought. */
export function ChangeCounts({ entry }: { entry: WikiEntry }) {
  if (!entry.counts) return null;
  return (
    <span className="wiki__counts">
      {CHANGES.filter(({ kind }) => entry.counts?.[kind]).map(({ kind, label }) => (
        <span key={kind} className={`wiki__count wiki__count--${kind}`}>
          {label} {entry.counts![kind]}
        </span>
      ))}
    </span>
  );
}

/** The home of the wiki: the articles and the updates, the catalogs in four groups, the pages opened last. */
export function WikiHome({ data, recent, onCatalog, onMap, onOpen, picture, earn }: { data: WikiData; recent: WikiEntry[]; onCatalog: (id: WikiCatalogId) => void; onMap: () => void; onOpen: (entry: WikiEntry) => void; picture: (src: string | undefined, className: string) => ReactNode; earn?: Earn }) {
  const titleOf = (id: WikiCatalogId) => data.catalogs.find((c) => c.id === id);
  const latest = data.entries.filter((e) => e.catalog === 'updates').sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0];
  const posts = titleOf('posts');
  return (
    <div className="wiki__home">
      <header className="wiki__welcome">
        <h2 className="wiki__heading">Вики Russia Online</h2>
        <p>Транспорт, предметы, работы и путеводитель по игровому миру</p>
      </header>
      <div className="wiki__links" role="group" aria-label="Быстрый переход">
        <button type="button" className="wiki__link" onClick={onMap}>
          <b>Карта</b>
          <span>Локации, поиск и слои официальной карты</span>
        </button>
        {posts && posts.count > 0 && (
          <button type="button" className="wiki__link" onClick={() => onCatalog('posts')}>
            <b>Статьи</b>
            <span>
              {posts.count} {plural(posts.count, 'статья', 'статьи', 'статей')}: как начать, работы, фракции
            </span>
          </button>
        )}
        {latest && (
          <button type="button" className="wiki__link" onClick={() => onCatalog('updates')}>
            <b>Обновления</b>
            <span>
              {latest.title}
              {latest.subtitle ? ` · ${latest.subtitle}` : ''}
            </span>
          </button>
        )}
      </div>

      <h3 className="wiki__h3">Каталоги</h3>
      <div className="wiki__groups-home">
        {GROUPS.map((group) => {
          const catalogs = group.catalogs.map(titleOf).filter((c) => !!c && c.count > 0);
          if (!catalogs.length) return null;
          return (
            <section key={group.title} className="wiki__tile" aria-label={group.title}>
              <h3 className="wiki__tile-title">{group.title}</h3>
              {picture(pictureOf(data, group.catalogs), 'wiki__tile-img')}
              <div className="wiki__chips">
                {catalogs.map((c) => (
                  <button key={c!.id} type="button" className="wiki__chip" onClick={() => onCatalog(c!.id)}>
                    {c!.title}
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <JobsBlock data={data} onOpen={onOpen} earn={earn} />

      {recent.length > 0 && (
        <>
          <h3 className="wiki__h3">Вы смотрели</h3>
          <section className="wiki__row" aria-label="Вы смотрели">
            {recent.map((entry) => (
              <button key={entry.id} type="button" className="wiki__card" aria-label={entry.title} onClick={() => onOpen(entry)}>
                <span className="wiki__thumb">{picture(entry.image, 'wiki__img')}</span>
                <span className="wiki__name">{entry.title}</span>
                <span className="wiki__meta">
                  <span>{titleOf(entry.catalog)?.title}</span>
                </span>
              </button>
            ))}
          </section>
        </>
      )}
    </div>
  );
}

/** The articles by the wiki's sections: «Подготовка», «Начало игры», «Работы», «Фракции». */
export function PostsView({ data, sectionId, onSection, onOpen, picture }: { data: WikiData; sectionId?: string; onSection: (id?: string) => void; onOpen: (entry: WikiEntry) => void; picture: (src: string | undefined, className: string) => ReactNode }) {
  const catalog = data.catalogs.find((c) => c.id === 'posts');
  const posts = data.entries.filter((e) => e.catalog === 'posts');
  const groups = catalog?.groups ?? [];
  return (
    <div className="wiki__posts">
      <div className="wiki__groups" role="group" aria-label="Разделы статей">
        <button type="button" className={!sectionId ? 'wiki__group wiki__group--on' : 'wiki__group'} aria-pressed={!sectionId} onClick={() => onSection()}>Все</button>
        {groups.map((section) => (
          <button key={section.id} type="button" className={sectionId === section.id ? 'wiki__group wiki__group--on' : 'wiki__group'} aria-pressed={sectionId === section.id} onClick={() => onSection(section.id)}>{section.label} <small>{section.count}</small></button>
        ))}
      </div>
      {groups.filter((section) => !sectionId || sectionId === section.id).map((section) => (
        <section key={section.id} aria-label={section.label}>
          <h3 className="wiki__h3">
            {section.label} <small>{section.count}</small>
          </h3>
          <div className="wiki__grid wiki__post-grid">
            {posts
              .filter((e) => e.group === section.id)
              .map((entry) => (
                <button key={entry.id} type="button" className="wiki__card" aria-label={entry.title} onClick={() => onOpen(entry)}>
                  <span className="wiki__thumb wiki__thumb--wide">{picture(entry.image, 'wiki__img')}</span>
                  <span className="wiki__name">{entry.title}</span>
                  <span className="wiki__meta">
                    <span>{readingTime(entry)}</span>
                  </span>
                </button>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** The updates of the game as a list: the build, its first line, what it added, changed and fixed, the date. */
export function UpdatesView({ entries, onOpen }: { entries: WikiEntry[]; onOpen: (entry: WikiEntry) => void }) {
  return (
    <ul className="wiki__updates" aria-label="Обновления">
      {entries.map((entry) => {
        const first = entry.blocks?.find((b) => b.type === 'item' || b.type === 'paragraph');
        return (
          <li key={entry.id}>
            <button type="button" className="wiki__update" onClick={() => onOpen(entry)}>
              <span className="wiki__update-text">
                <b>{entry.title}</b>
                <span>{first && 'text' in first ? first.text : (entry.text ?? '').slice(0, 140)}</span>
              </span>
              <ChangeCounts entry={entry} />
              <small>{entry.subtitle}</small>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** An article or an update as written: headings, paragraphs, lists by depth (an update's marked), quotes, tables, pictures. */
export function Blocks({ blocks, picture, contents = false }: { blocks: WikiBlock[]; contents?: boolean; picture: (src: string | undefined, className: string) => ReactNode }) {
  const prefix = useId();
  const headings = contents ? blocks.flatMap((block, index) => block.type === 'heading' ? [{ index, title: block.text }] : []) : [];
  return (
    <div className="wiki__doc">
      {headings.length > 1 && (
        <details className="wiki__toc" open>
          <summary>Оглавление</summary>
          <nav aria-label="Оглавление статьи">
            {headings.map(({ index, title }) => (
              <button key={index} className="link" type="button" onClick={() => {
                const heading = document.getElementById(prefix + index);
                heading?.focus();
                heading?.scrollIntoView({ block: 'start' });
              }}>{title}</button>
            ))}
          </nav>
        </details>
      )}
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'heading':
            return (
              <h3 key={i} id={prefix + i} tabIndex={-1} className="wiki__h3">
                {block.text}
              </h3>
            );
          case 'paragraph':
            return (
              <p key={i} className="wiki__text">
                {block.text}
              </p>
            );
          case 'quote':
            return (
              <blockquote key={i} className="wiki__quote">
                {block.text}
              </blockquote>
            );
          case 'item':
            return (
              <p key={i} className={`wiki__item${block.kind ? ` wiki__item--${block.kind}` : ''}`} style={{ marginLeft: block.depth * 18 }}>
                {block.text}
              </p>
            );
          case 'table':
            return (
              <div key={i} className="wiki__table-wrap">
                <table className="wiki__table">
                  {block.header && block.rows.length > 0 && (
                    <thead><tr>{block.rows[0].map((cell, index) => <th key={index} scope="col">{cell}</th>)}</tr></thead>
                  )}
                  <tbody>
                    {block.rows.slice(block.header ? 1 : 0).map((row, r) => (
                      <tr key={r}>
                        {row.map((cell, c) => <td key={c}>{cell}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case 'image':
            return <div key={i}>{picture(block.src, 'wiki__doc-img')}</div>;
        }
      })}
    </div>
  );
}
