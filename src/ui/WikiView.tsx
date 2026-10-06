import { useEffect, useMemo, useState } from 'react';
import { usePlatform } from '../platform/PlatformContext';
import { neighbours, pick, tagsOf, type WikiSort } from '../wiki/catalog';
import { formatRubles } from '../core';
import { FRESH, type Gender, type WikiCatalogId, type WikiData, type WikiEntry } from '../wiki/model';
import { Dropdown } from './Dropdown';
import { BackIcon, ExternalIcon, SearchIcon } from './icons';
import { useWiki } from './wiki';

/** How many cards at a time: the rest on «Показать ещё». */
const PAGE = 60;

const SORTS: { id: WikiSort; label: string }[] = [
  { id: 'new', label: 'Сначала новые' },
  { id: 'cheap', label: 'Сначала дешёвые' },
  { id: 'expensive', label: 'Сначала дорогие' },
  { id: 'name', label: 'По названию' },
];

/** A picture from the wiki's CDN; nothing when it does not load (offline) — the card keeps its place. */
function Picture({ src, alt, className }: { src?: string; alt: string; className: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return <span className={`${className} wiki__noimage`} aria-hidden="true" />;
  return <img className={className} src={src} alt={alt} loading="lazy" decoding="async" onError={() => setBroken(true)} />;
}

function Card({ entry, onOpen, showCatalog }: { entry: WikiEntry; onOpen: () => void; showCatalog?: string }) {
  return (
    <button type="button" className="wiki__card" onClick={onOpen} aria-label={entry.title}>
      <span className="wiki__thumb">
        <Picture src={entry.image} alt="" className="wiki__img" />
        {entry.tags.includes(FRESH) && <span className="wiki__fresh">{FRESH}</span>}
      </span>
      <span className="wiki__name">{entry.title}</span>
      <span className="wiki__meta">
        <span>{showCatalog ?? entry.subtitle}</span>
        {entry.price ? <b>{formatRubles(entry.price)}</b> : entry.priceNote ? <b>{entry.priceNote}</b> : null}
      </span>
    </button>
  );
}

/** The source of every page of the section, whose it is, and a way to it (README «Лицензия и права»). */
function Source({ url }: { url: string }) {
  const platform = usePlatform();
  return (
    <p className="wiki__source">
      Данные и изображения: вики Russia Online. Все права принадлежат Russia Online.{' '}
      <button className="link" type="button" onClick={() => void platform.openExternal(url)}>
        Открыть на вики <ExternalIcon />
      </button>
    </p>
  );
}

function EntryPage({ data, entry, onOpen, onBack, backLabel }: { data: WikiData; entry: WikiEntry; onOpen: (entry: WikiEntry) => void; onBack: () => void; backLabel: string }) {
  const views = entry.views ?? [];
  const [view, setView] = useState(0);
  useEffect(() => setView(0), [entry.id]);
  const shown = views[view];
  const more = neighbours(data, entry);
  return (
    <article className="wiki__entry" aria-label={entry.title}>
      <button className="back" type="button" onClick={onBack}>
        <BackIcon />
        <span>{backLabel}</span>
      </button>
      <div className="wiki__hero">
        <Picture src={shown?.image ?? entry.image} alt={shown?.name || entry.title} className="wiki__big" />
        <div className="wiki__about">
          <h2 className="wiki__title">{entry.title}</h2>
          {entry.subtitle && <p className="wiki__subtitle">{entry.subtitle}</p>}
          {entry.tags.length > 0 && (
            <div className="wiki__tags">
              {entry.tags.map((tag) => (
                <span key={tag} className={tag === FRESH ? 'wiki__tag wiki__tag--fresh' : 'wiki__tag'}>
                  {tag}
                </span>
              ))}
            </div>
          )}
          <div className="wiki__prices">
            {entry.price ? (
              <span>
                <b>{formatRubles(entry.price)}</b>
                <small>Гос. стоимость</small>
              </span>
            ) : entry.priceNote ? (
              <span>
                <b>{entry.priceNote}</b>
                <small>Способ оплаты</small>
              </span>
            ) : null}
            {entry.sellPrice ? (
              <span>
                <b>{formatRubles(entry.sellPrice)}</b>
                <small>Стоимость свалки</small>
              </span>
            ) : null}
          </div>
          {entry.sources.length > 0 && <p className="wiki__where">Где получить: {entry.sources.join(', ')}</p>}
        </div>
      </div>
      {views.length > 1 && (
        <div className="wiki__views" role="radiogroup" aria-label="Виды">
          {views.map((v, i) => (
            <button key={`${v.image}-${i}`} type="button" role="radio" aria-checked={i === view} aria-label={v.name || `Вид ${i + 1}`} title={v.name} className={i === view ? 'wiki__view wiki__view--on' : 'wiki__view'} onClick={() => setView(i)}>
              <Picture src={v.image} alt="" className="wiki__img" />
            </button>
          ))}
        </div>
      )}
      {shown?.name && views.length > 1 && <p className="wiki__viewname">{shown.name}</p>}
      {entry.facts.length > 0 && (
        <dl className="wiki__facts">
          {entry.facts.map(([label, value], i) => (
            <div key={`${label}-${i}`} className="wiki__fact">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {entry.text && <p className="wiki__text">{entry.text}</p>}
      {more.length > 0 && (
        <>
          <h3 className="wiki__h3">Ещё в этой категории</h3>
          <div className="wiki__row">
            {more.map((e) => (
              <Card key={e.id} entry={e} onOpen={() => onOpen(e)} />
            ))}
          </div>
        </>
      )}
      <Source url={entry.url} />
    </article>
  );
}

/**
 * The wiki of Russia Online, inside the assistant: its catalogs — vehicles, clothes, haircuts… — with tabs, men's
 * and women's, filters, search and order, and a page for each thing. The data is the wiki's (scripts/wiki-import.ts),
 * said on every page; the pictures come from its CDN.
 */
export function WikiView() {
  const { data, failed } = useWiki();
  const [catalog, setCatalog] = useState<WikiCatalogId>('vehicles');
  const [group, setGroup] = useState<string | undefined>();
  const [gender, setGender] = useState<Gender>('male');
  const [tags, setTags] = useState<string[]>([]);
  const [words, setWords] = useState('');
  const [everywhere, setEverywhere] = useState('');
  const [sort, setSort] = useState<WikiSort>('new');
  const [shown, setShown] = useState(PAGE);
  const [entry, setEntry] = useState<WikiEntry | null>(null);

  // Another catalog, tab or filter: from the top.
  useEffect(() => setShown(PAGE), [catalog, group, gender, tags, words, everywhere, sort]);

  const current = data?.catalogs.find((c) => c.id === catalog);
  const searching = everywhere.trim().length > 1;
  const list = useMemo(
    () => (!data ? [] : searching ? pick(data, { words: everywhere, sort: 'name' }) : pick(data, { catalog, group, gender: current?.genders ? gender : undefined, tags, words, sort })),
    [data, searching, everywhere, catalog, group, gender, current, tags, words, sort],
  );
  const filters = useMemo(() => (data ? tagsOf(data, catalog) : []), [data, catalog]);
  const titleOf = (id: WikiCatalogId) => data?.catalogs.find((c) => c.id === id)?.title ?? '';

  if (failed) return <p className="empty">Не удалось открыть вики.</p>;
  if (!data) return <p className="empty">Загружаю вики…</p>;

  const choose = (id: WikiCatalogId) => {
    setCatalog(id);
    setGroup(undefined);
    setTags([]);
    setWords('');
    setEverywhere('');
    setEntry(null);
  };

  return (
    <section className="wiki" aria-label="Вики">
      <nav className="wiki__nav" aria-label="Разделы вики">
        {data.catalogs.map((c) => (
          <button key={c.id} type="button" className={c.id === catalog && !searching ? 'wiki__navitem wiki__navitem--on' : 'wiki__navitem'} aria-current={c.id === catalog && !searching ? 'page' : undefined} onClick={() => choose(c.id)}>
            <span>{c.title}</span>
            <small>{c.count.toLocaleString('ru-RU')}</small>
          </button>
        ))}
      </nav>

      <div className="wiki__main">
        <label className="wiki__search">
          <SearchIcon />
          <input type="search" aria-label="Поиск по вики" placeholder="Поиск по вики: машина, одежда, предмет…" value={everywhere} onChange={(e) => {
            setEverywhere(e.target.value);
            setEntry(null);
          }} />
        </label>

        {entry ? (
          <EntryPage data={data} entry={entry} onOpen={setEntry} onBack={() => setEntry(null)} backLabel={searching ? 'Результаты' : (current?.title ?? 'Назад')} />
        ) : searching ? (
          <>
            <h2 className="wiki__heading">
              Найдено: {list.length.toLocaleString('ru-RU')}
            </h2>
            <div className="wiki__grid">
              {list.slice(0, shown).map((e) => (
                <Card key={e.id} entry={e} onOpen={() => setEntry(e)} showCatalog={titleOf(e.catalog)} />
              ))}
            </div>
            {!list.length && <p className="empty">Ничего не нашлось.</p>}
          </>
        ) : (
          <>
            <div className="wiki__head">
              <h2 className="wiki__heading">
                {current?.title} <small>{list.length.toLocaleString('ru-RU')} из {current?.count.toLocaleString('ru-RU')}</small>
              </h2>
              <span className="sp" />
              {current?.genders && (
                <span className="tabs" role="radiogroup" aria-label="Пол">
                  {(['male', 'female'] as Gender[]).map((g) => (
                    <button key={g} type="button" role="radio" aria-checked={gender === g} className={gender === g ? 'tabs__btn tabs__btn--on' : 'tabs__btn'} onClick={() => setGender(g)}>
                      {g === 'male' ? 'Мужская' : 'Женская'}
                    </button>
                  ))}
                </span>
              )}
            </div>

            {current && current.groups.length > 1 && (
              <div className="wiki__groups" role="radiogroup" aria-label="Категории">
                <button type="button" role="radio" aria-checked={!group} className={!group ? 'wiki__group wiki__group--on' : 'wiki__group'} onClick={() => setGroup(undefined)}>
                  Все
                </button>
                {current.groups.map((g) => (
                  <button key={g.id} type="button" role="radio" aria-checked={group === g.id} className={group === g.id ? 'wiki__group wiki__group--on' : 'wiki__group'} onClick={() => setGroup(g.id)}>
                    {g.label} <small>{g.count}</small>
                  </button>
                ))}
              </div>
            )}

            <div className="wiki__tools">
              <input className="presets__input wiki__find" type="search" aria-label="Поиск в разделе" placeholder="Поиск в разделе" value={words} onChange={(e) => setWords(e.target.value)} />
              <Dropdown className="wiki__sort" label="Порядок" value={sort} onChange={(value) => setSort(value as WikiSort)} options={SORTS.map((s) => ({ value: s.id, label: s.label }))} />
            </div>
            {filters.length > 0 && (
              <div className="wiki__filters" aria-label="Фильтры">
                {filters.map(({ tag, count }) => (
                  <label key={tag} className={tags.includes(tag) ? 'wiki__filter wiki__filter--on' : 'wiki__filter'}>
                    <input type="checkbox" checked={tags.includes(tag)} onChange={(e) => setTags((now) => (e.target.checked ? [...now, tag] : now.filter((t) => t !== tag)))} />
                    {tag} <small>{count}</small>
                  </label>
                ))}
              </div>
            )}

            <div className="wiki__grid">
              {list.slice(0, shown).map((e) => (
                <Card key={e.id} entry={e} onOpen={() => setEntry(e)} />
              ))}
            </div>
            {!list.length && <p className="empty">Ничего не нашлось — уберите фильтр или измените запрос.</p>}
          </>
        )}

        {!entry && list.length > shown && (
          <button className="settings__button wiki__more" type="button" onClick={() => setShown((n) => n + PAGE)}>
            Показать ещё ({(list.length - shown).toLocaleString('ru-RU')})
          </button>
        )}
        {!entry && <Source url={data.source} />}
      </div>
    </section>
  );
}
