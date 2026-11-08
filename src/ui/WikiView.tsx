import { startTransition, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePlatform } from '../platform/PlatformContext';
import { neighbours, pick, tagsOf, type VehicleFilters, type WikiSort } from '../wiki/catalog';
import { formatRubles } from '../core';
import { FRESH, type Gender, type WikiCatalogId, type WikiData, type WikiEntry } from '../wiki/model';
import { Dropdown } from './Dropdown';
import { BackIcon, ExternalIcon, SearchIcon } from './icons';
import { useWiki } from './wiki';
import { JobInfo, MakeCalculator, type Earn } from './WikiTools';
import { WikiTuningCalculator } from './WikiTuningCalculator';
import { useServerRates, useShifts } from './shifts';
import { jobsOf } from '../wiki/jobs';
import { Blocks, ChangeCounts, PostsView, UpdatesView, WikiHome, readingTime, useWikiRecent } from './WikiHome';

/**
 * How many cards at a time: the rest on «Показать ещё». The wiki's pictures are big — a flat's is 2560×1440 and
 * megabytes — so a page is what a screen or two shows, not more to fetch and decode on every tab.
 */
const PAGE = 30;
const WIKI_MAP_URL = 'https://wiki.russia.online/ru/map';
const VEHICLE_FIELDS: { key: keyof VehicleFilters; label: string }[] = [
  { key: 'maxPrice', label: 'Госцена до, ₽' },
  { key: 'minStockSpeed', label: 'Сток от, км/ч' },
  { key: 'minFullSpeed', label: 'ФТ от, км/ч' },
  { key: 'minTrunk', label: 'Багажник от, кг' },
];

const CARD_FACTS: Partial<Record<WikiCatalogId, readonly string[]>> = {
  vehicles: ['Макс. скорость', 'С полным тюнингом', 'Багажник', 'Грузоподъёмность'],
  clothes: ['Расцветок'],
  items: ['Вес', 'Размер', 'В стопке'],
  animations: ['Зациклена'],
  wheels: ['Вариантов'],
  businesses: ['Номер'],
  realties: ['Гаражных мест'],
  recipes: ['Время', 'Выход'],
  crafts: ['Фракция', 'Оружейные материалы', 'Технические материалы', 'Медицинские материалы'],
};

const CARD_TAGS = ['Разрешено в госструктурах', 'Со звуком', 'Не продаётся', 'Маркетплейс'];

const SORTS: { id: WikiSort; label: string }[] = [
  { id: 'new', label: 'Сначала новые' },
  { id: 'cheap', label: 'Сначала дешёвые' },
  { id: 'expensive', label: 'Сначала дорогие' },
  { id: 'name', label: 'По названию' },
];

/**
 * A picture from the wiki's CDN; nothing when it does not load (offline) — the card keeps its place. An animation
 * is a video: it plays on its own page, and a card shows that it is one instead of fetching it.
 */
function Picture({ src, alt, className, play }: { src?: string; alt: string; className: string; play?: boolean }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  if (src && /.(webm|mp4)$/i.test(src) && !broken) {
    if (!play) return <span className={`${className} wiki__noimage wiki__video`} aria-hidden="true" />;
    return <video className={className} src={src} autoPlay loop muted playsInline aria-label={alt} onError={() => setBroken(true)} />;
  }
  if (!src || broken) return <span className={`${className} wiki__noimage`} aria-hidden="true" />;
  return <img className={className} src={src} alt={alt} loading="lazy" decoding="async" onError={() => setBroken(true)} />;
}

function Card({ entry, onOpen, showCatalog, compact = false }: { entry: WikiEntry; onOpen: () => void; showCatalog?: string; compact?: boolean }) {
  const labels = CARD_FACTS[entry.catalog];
  const facts = compact && labels ? entry.facts.filter(([label]) => labels.includes(label)) : [];
  const tags = compact ? entry.tags.filter((tag) => CARD_TAGS.includes(tag)) : [];
  const subtitle = [showCatalog, entry.subtitle].filter((value, index, values) => value && values.indexOf(value) === index).join(' · ');
  return (
    <button type="button" className="wiki__card" onClick={onOpen} aria-label={entry.title}>
      <span className="wiki__thumb">
        <Picture src={entry.image} alt="" className="wiki__img" />
        {entry.tags.includes(FRESH) && <span className="wiki__fresh">{FRESH}</span>}
      </span>
      <span className="wiki__name">{entry.title}</span>
      <span className="wiki__meta">
        <span>{subtitle}</span>
        {entry.price ? <b>{formatRubles(entry.price)}</b> : entry.priceNote && !entry.subtitle?.includes(entry.priceNote) ? <b>{entry.priceNote}</b> : null}
      </span>
      {(facts.length > 0 || tags.length > 0) && (
        <span className="wiki__card-facts">
          {facts.map(([label, value], index) => <span key={index}>{label} <b>{value}</b></span>)}
          {tags.map((tag) => <span className="wiki__card-tag" key={tag}>{tag}</span>)}
        </span>
      )}
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

function EntryPage({ data, entry, onOpen, onBack, backLabel, earn }: { data: WikiData; entry: WikiEntry; onOpen: (entry: WikiEntry) => void; onBack: () => void; backLabel: string; earn?: Earn }) {
  const platform = usePlatform();
  const [view, setView] = useState(0);
  const [large, setLarge] = useState(false);
  const isVehicle = entry.catalog === 'vehicles';
  const kits = isVehicle
    ? data.entries.filter((item) => item.catalog === 'modkits' && item.facts.some(([label, value]) => label === 'Машина' && value === entry.title))
    : [];
  const variants = [
    ...(entry.views ?? []),
    ...kits.flatMap((kit) => kit.image ? [{ image: kit.image, name: kit.title }] : []),
  ];
  const base = entry.image && !variants.some((variant) => variant.image === entry.image)
    ? [{ image: entry.image, name: 'Основной вид' }]
    : [];
  const views = [...base, ...variants];
  const shown = views[view];
  const picture = shown?.image ?? entry.image;
  const canEnlarge = !!picture && !/\.(webm|mp4)$/i.test(picture);
  const more = neighbours(data, entry);
  const speeds = isVehicle
    ? entry.facts.filter(([label]) => label === 'Макс. скорость' || label === 'С полным тюнингом')
    : [];
  // A recipe's ingredients are shown in its calculator, and vehicle speeds in the header.
  const facts = entry.facts.filter((item) => !speeds.includes(item) && !entry.make?.parts.some((part) => part.name === item[0]));
  return (
    <article className={`wiki__entry wiki__entry--${entry.catalog}`} aria-label={entry.title}>
      <button className="back" type="button" onClick={onBack}>
        <BackIcon />
        <span>{backLabel}</span>
      </button>
      <div className={large ? 'wiki__hero wiki__hero--large' : 'wiki__hero'}>
        {canEnlarge ? (
          <button className="wiki__zoom" type="button" aria-label={large ? 'Уменьшить фото' : 'Увеличить фото'} aria-expanded={large} onClick={() => setLarge(!large)}>
            <Picture src={picture} alt={shown?.name || entry.title} className="wiki__big" />
            <span className="wiki__zoom-label">{large ? 'Уменьшить' : 'Увеличить'}</span>
          </button>
        ) : picture && <Picture src={picture} alt={shown?.name || entry.title} className="wiki__big" play />}
        <div className="wiki__about">
          <h2 className="wiki__title">{entry.title}</h2>
          {entry.subtitle && <p className="wiki__subtitle">{entry.subtitle}</p>}
          {entry.catalog === 'posts' && <p className="wiki__subtitle">{readingTime(entry)}</p>}
          {entry.tags.length > 0 && (
            <div className="wiki__tags">
              {entry.tags.map((tag) => (
                <span key={tag} className={tag === FRESH ? 'wiki__tag wiki__tag--fresh' : 'wiki__tag'}>
                  {tag}
                </span>
              ))}
            </div>
          )}
          {speeds.length > 0 && (
            <dl className="wiki__facts wiki__speeds">
              {speeds.map(([label, value]) => (
                <div className="wiki__fact" key={label}>
                  <dt>{label === 'Макс. скорость' ? 'Скорость в стоке' : 'С полным тюнингом'}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
          {(entry.price || entry.priceNote || entry.sellPrice) ? <div className="wiki__prices">
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
          </div> : null}
          {isVehicle && entry.tags.includes('Маркетплейс') && (
            <button className="btn btn--sm" type="button" onClick={() => void platform.openExternal(entry.url)}>
              Цены по серверам на вики <ExternalIcon />
            </button>
          )}
          {entry.sources.length > 0 && <p className="wiki__where">Где получить: {entry.sources.join(', ')}</p>}
        </div>
      </div>
      {views.length > 1 && (
        <div className="wiki__gallery">
          <div className="wiki__gallery-nav">
            <button className="btn btn--sm" type="button" aria-label="Предыдущее фото" onClick={() => setView((view + views.length - 1) % views.length)}>←</button>
            <span aria-live="polite">{view + 1} / {views.length}{shown?.name ? ' · ' + shown.name : ''}</span>
            <button className="btn btn--sm" type="button" aria-label="Следующее фото" onClick={() => setView((view + 1) % views.length)}>→</button>
          </div>
          <div className="wiki__views" role="radiogroup" aria-label="Виды">
              {views.map((v, i) => (
                <button key={`${v.image}-${i}`} type="button" role="radio" aria-checked={i === view} aria-label={v.name || `Вид ${i + 1}`} title={v.name} className={i === view ? 'wiki__view wiki__view--on' : 'wiki__view'} onClick={() => setView(i)}>
                  <Picture src={v.image} alt="" className="wiki__img" />
                </button>
              ))}
          </div>
        </div>
      )}
      {kits.length > 0 && (
        <section aria-label="Обвесы этой машины">
          <h3 className="wiki__h3">Обвесы этой машины</h3>
          <div className="wiki__row">{kits.map((kit) => <Card key={kit.id} entry={kit} onOpen={() => onOpen(kit)} />)}</div>
        </section>
      )}
      {facts.length > 0 && (
        <section className="wiki__details">
          <h3 className="wiki__h3">Характеристики</h3>
          <dl className="wiki__facts">
            {facts.map(([label, value], i) => (
              <div key={`${label}-${i}`} className="wiki__fact">
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {entry.tuning && <WikiTuningCalculator tuning={entry.tuning} />}
      {entry.make && <MakeCalculator key={entry.id} make={entry.make} />}
      {entry.job && <JobInfo job={entry.job} title={entry.title} earn={earn} jobs={jobsOf(data)} />}
      {entry.counts && <ChangeCounts entry={entry} />}
      {entry.blocks?.length ? (
        <Blocks blocks={entry.blocks} contents={entry.catalog === 'posts'} picture={(src, className) => <Picture src={src} alt="" className={className} />} />
      ) : (
        entry.text && <p className="wiki__text">{entry.text}</p>
      )}
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
/** `server`: the game's server the player is on, for the shifts and what the jobs pay there. */
/** `openId`: a page to open at once — a job pressed among the home screen's boosts. */
export function WikiView({ server = 'tverskoi', openId }: { server?: string; openId?: string }) {
  const platform = usePlatform();
  const { data, failed } = useWiki();
  const shifts = useShifts();
  const rates = useServerRates(server);
  const earn: Earn = { ...shifts, server, rates };
  // The wiki opens on its home: the articles, the updates, the catalogs in groups, the pages opened last.
  const [catalog, setCatalog] = useState<WikiCatalogId | 'home' | 'map'>('home');
  const [group, setGroup] = useState<string | undefined>();
  const [gender, setGender] = useState<Gender>('male');
  const [tags, setTags] = useState<string[]>([]);
  const [words, setWords] = useState('');
  const [everywhere, setEverywhere] = useState('');
  const [sort, setSort] = useState<WikiSort>('new');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [vehicle, setVehicle] = useState<VehicleFilters>({});
  const [trail, setTrail] = useState<{ entry: WikiEntry; scrollTop: number }[]>([]);
  const [shown, setShown] = useState(PAGE);
  const [entry, setEntry] = useState<WikiEntry | null>(null);
  const wikiRef = useRef<HTMLElement>(null);
  const listScroll = useRef(0);
  const nextScroll = useRef(0);
  const scrollContainer = () => wikiRef.current?.closest('.overlay__content');

  useLayoutEffect(() => {
    const container = wikiRef.current?.closest('.overlay__content');
    if (container) container.scrollTop = nextScroll.current;
    nextScroll.current = 0;
  }, [catalog, entry]);

  const { recent, remember } = useWikiRecent(data);
  // A page opened is one the player looked at: it goes to «Вы смотрели».
  const open = (e: WikiEntry) => {
    remember(e);
    listScroll.current = scrollContainer()?.scrollTop ?? 0;
    setTrail([]);
    setEntry(e);
  };
  const picture = (src: string | undefined, className: string) => <Picture src={src} alt="" className={className} />;

  // A page asked for from outside the wiki: opened once the wiki is read.
  useEffect(() => {
    const asked = openId && data?.entries.find((e) => e.id === openId);
    if (asked) { listScroll.current = 0; setTrail([]); setEntry(asked); }
  }, [openId, data]);

  // Another catalog, tab or filter: from the top.
  useEffect(() => setShown(PAGE), [catalog, group, gender, tags, words, everywhere, sort, vehicle]);

  const current = catalog === 'home' ? undefined : data?.catalogs.find((c) => c.id === catalog);
  const searching = everywhere.trim().length > 1;
  const list = useMemo(
    () =>
      !data || ((catalog === 'home' || catalog === 'map') && !searching)
        ? []
        : searching
          ? pick(data, { words: everywhere, sort: 'name' })
          : pick(data, { catalog: catalog as WikiCatalogId, group, gender: current?.genders ? gender : undefined, tags, words, sort, vehicle: catalog === 'vehicles' ? vehicle : undefined }),
    [data, searching, everywhere, catalog, group, gender, current, tags, words, sort, vehicle],
  );
  const filters = useMemo(() => (data && catalog !== 'home' && catalog !== 'map' ? tagsOf(data, catalog) : []), [data, catalog]);
  const layoutPicker = (
    <div className="wiki__layout tabs" role="group" aria-label="Вид каталога">
      <button type="button" className={layout === 'grid' ? 'tabs__btn tabs__btn--on' : 'tabs__btn'} aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')}>Сетка</button>
      <button type="button" className={layout === 'list' ? 'tabs__btn tabs__btn--on' : 'tabs__btn'} aria-pressed={layout === 'list'} onClick={() => setLayout('list')}>Список</button>
    </div>
  );
  const resultsClass = layout === 'grid' ? 'wiki__grid' : 'wiki__grid wiki__grid--list';
  const titleOf = (id: WikiCatalogId) => data?.catalogs.find((c) => c.id === id)?.title ?? '';

  if (failed) return <p className="empty">Не удалось открыть вики.</p>;
  if (!data) return <p className="empty">Загружаю вики…</p>;

  // The tab lights up at once; the cards of the new one follow as soon as they are ready.
  const choose = (id: WikiCatalogId | 'home' | 'map') =>
    startTransition(() => {
      setCatalog(id);
      setGroup(undefined);
      setTags([]);
      setWords('');
      setEverywhere('');
      setVehicle({});
      setSort('new');
      setTrail([]);
      setEntry(null);
    });

  return (
    <section ref={wikiRef} className="wiki" aria-label="Вики">
      <nav className="wiki__nav" aria-label="Разделы вики">
        <button type="button" className={catalog === 'home' && !searching ? 'wiki__navitem wiki__navitem--on' : 'wiki__navitem'} aria-current={catalog === 'home' && !searching ? 'page' : undefined} onClick={() => choose('home')}>
          <span>Главная</span>
        </button>
        <button type="button" className={catalog === 'map' && !entry ? 'wiki__navitem wiki__navitem--on' : 'wiki__navitem'} aria-current={catalog === 'map' && !entry ? 'page' : undefined} onClick={() => choose('map')}>
          <span>Карта</span>
        </button>
        {data.catalogs.map((c) => (
          <button key={c.id} type="button" className={c.id === catalog && !searching ? 'wiki__navitem wiki__navitem--on' : 'wiki__navitem'} aria-current={c.id === catalog && !searching ? 'page' : undefined} onClick={() => choose(c.id)}>
            <span>{c.title}</span>
            <small>{c.count.toLocaleString('ru-RU')}</small>
          </button>
        ))}
      </nav>

      <div className="wiki__main">
        {(catalog !== 'map' || entry) && <label className="wiki__search">
          <SearchIcon />
          <input type="search" aria-label="Поиск по вики" placeholder="Поиск по вики: машина, одежда, предмет…" value={everywhere} onChange={(e) => {
            setEverywhere(e.target.value);
            setEntry(null);
          }} />
        </label>}

        {entry ? (
          <EntryPage key={entry.id} data={data} entry={entry} onOpen={(next) => {
            remember(next);
            const scrollTop = scrollContainer()?.scrollTop ?? 0;
            setTrail((previous) => [...previous, { entry, scrollTop }]);
            setEntry(next);
          }} onBack={() => {
            const previous = trail.at(-1);
            nextScroll.current = previous?.scrollTop ?? listScroll.current;
            setEntry(previous?.entry ?? null);
            setTrail(trail.slice(0, -1));
          }} backLabel={trail.at(-1)?.entry.title ?? (searching ? 'Результаты' : current?.title ?? 'Главная')} earn={earn} />
        ) : searching ? (
          <>
            <div className="wiki__head wiki__section-head">
              <h2 className="wiki__heading">Найдено: {list.length.toLocaleString('ru-RU')}</h2>
              {layoutPicker}
            </div>
            <div className={resultsClass}>
              {list.slice(0, shown).map((e) => (
                <Card key={e.id} entry={e} onOpen={() => open(e)} showCatalog={titleOf(e.catalog)} compact={layout === 'list'} />
              ))}
            </div>
            {!list.length && <p className="empty">Ничего не нашлось.</p>}
          </>
        ) : catalog === 'map' ? (
          <section className="wiki__map" aria-labelledby="wiki-map-title">
            <div className="wiki__map-head">
              <div>
                <h2 id="wiki-map-title" className="wiki__heading">Карта</h2>
                <p>Официальная вики Russia Online</p>
              </div>
              <button className="btn btn--sm" type="button" onClick={() => void platform.openExternal(WIKI_MAP_URL)}>
                Открыть в браузере <ExternalIcon />
              </button>
            </div>
            <iframe className="wiki__map-frame" src={WIKI_MAP_URL} title="Карта Russia Online" referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin" />
          </section>
        ) : catalog === 'home' ? (
          <WikiHome data={data} recent={recent} onMap={() => choose('map')} onCatalog={choose} onOpen={open} picture={picture} earn={earn} />
        ) : catalog === 'posts' ? (
          <>
            <h2 className="wiki__heading">Статьи</h2>
            <PostsView data={data} sectionId={group} onSection={setGroup} onOpen={open} picture={picture} />
          </>
        ) : catalog === 'updates' && !searching ? (
          <>
            <div className="wiki__head">
              <h2 className="wiki__heading">Обновления</h2>
              <span className="sp" />
              <input className="presets__input wiki__find" type="search" aria-label="Поиск в разделе" placeholder="Поиск в разделе" value={words} onChange={(e) => setWords(e.target.value)} />
            </div>
            <UpdatesView entries={list.slice(0, shown)} onOpen={open} />
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
              <Dropdown className="wiki__sort" label="Порядок" value={sort} onChange={(value) => setSort(value as WikiSort)} options={[...SORTS.map((s) => ({ value: s.id, label: s.label })), ...(catalog === 'vehicles' ? [{ value: 'fastest', label: 'Сначала быстрые' }] : [])]} />
              {layoutPicker}
            </div>
            {catalog === 'vehicles' && (
              <details className="wiki__vehicle-filters">
                <summary>Характеристики транспорта</summary>
                <div className="wiki__filters">
                  {VEHICLE_FIELDS.map(({ key, label }) => (
                    <label key={key}>
                      <span>{label}</span>
                      <input className="presets__input" type="number" min="0" inputMode="numeric" value={vehicle[key] ?? ''} onChange={(event) => {
                        const value = event.currentTarget.valueAsNumber;
                        setVehicle((current) => ({ ...current, [key]: Number.isFinite(value) && value >= 0 ? value : undefined }));
                      }} />
                    </label>
                  ))}
                  <button className="btn btn--sm" type="button" onClick={() => setVehicle({})}>Сбросить характеристики</button>
                </div>
              </details>
            )}
            {words.trim().length > 1 && (
              <button className="btn btn--sm" type="button" onClick={() => setEverywhere(words)}>Искать во всей вики</button>
            )}
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

            <div className={resultsClass}>
              {list.slice(0, shown).map((e) => (
                <Card key={e.id} entry={e} onOpen={() => open(e)} compact={layout === 'list'} />
              ))}
            </div>
            {!list.length && <p className="empty">Ничего не нашлось — уберите фильтр или измените запрос.</p>}
          </>
        )}

        {!entry && (searching || catalog !== 'posts') && list.length > shown && (
          <button className="settings__button wiki__more" type="button" onClick={() => setShown((n) => n + PAGE)}>
            Показать ещё ({(list.length - shown).toLocaleString('ru-RU')})
          </button>
        )}
        {!entry && catalog !== 'map' && <Source url={data.source} />}
      </div>
    </section>
  );
}
