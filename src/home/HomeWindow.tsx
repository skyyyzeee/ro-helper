import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { aiCapabilitiesOf } from '../account/capabilities';
import {
  articleHeading,
  chapterHeading,
  formatPunishment,
  recentChanges,
  searchUnderstood,
  type Article,
  type Intent,
  type LawDocument,
  type Part,
  type SearchHit,
  type ServerPack,
} from '../core';
import { loadPack } from '../data';
import type { HomeBridge, QuickRequest, ResizeEdge } from '../platform/types';
import { historyKey } from '../ui/ai';
import { jurisdictionText } from '../ui/lawBits';
import { isNewer, readPack } from '../ui/laws';
import { PROFILE_KEY, type Profile } from '../ui/profile';
import { entryPart, favoritesKey, hitKey, recentKey, useHitLookup } from '../ui/saved';
import { HOME_ICONS } from './icons';
import './fonts.css';
import './home.css';

type Section = 'today' | 'laws' | 'ai' | 'duty' | 'wiki' | 'settings';
const SECTIONS: { id: Exclude<Section, 'settings'>; label: string }[] = [
  { id: 'today', label: 'Сегодня' },
  { id: 'laws', label: 'Законы' },
  { id: 'ai', label: 'ИИ' },
  { id: 'duty', label: 'Служба' },
  { id: 'wiki', label: 'Вики' },
];

const SURVEY_KEY = 'home.survey';
const REPORTS_KEY = 'home.reports';
/** «Подробно» (Shapeshift's «advanced mode»): the chapter, who investigates each part, the notes. Off by default. */
const DETAILED_KEY = 'home.detailed';

const SURVEY_ANSWERS = ['Нет, не замечаю', 'Иногда, при открытии', 'Да, заметно', 'Не играю с ним открытым'];

const starsOf = (part?: Part) => (part?.stars ? '★'.repeat(part.stars.max) : '');
const dateOf = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
const hitTitle = (hit: { article: Article; document: LawDocument; part?: Part }) =>
  `${hit.document.short} ст. ${hit.article.number}${hit.part?.number ? ` ч. ${hit.part.number}` : ''}`;

interface Laws {
  pack: ServerPack;
  profile: Profile;
}

/** The server's laws as the overlay has them: the built-in ones, or newer ones kept from GitHub. */
function useHomeLaws(bridge: HomeBridge): Laws | null | undefined {
  const [laws, setLaws] = useState<Laws | null | undefined>(undefined);
  useEffect(() => {
    let active = true;
    void (async () => {
      const profile = await bridge.readSetting<Profile>(PROFILE_KEY);
      if (!profile) return active && setLaws(null);
      const bundled = await loadPack(profile.server);
      const kept = readPack(await bridge.readLaws(profile.server).catch(() => undefined), profile.server);
      if (active) setLaws({ profile, pack: kept && isNewer(kept, bundled) ? kept : bundled });
    })();
    return () => {
      active = false;
    };
  }, [bridge]);
  return laws;
}

/** A setting of the main window kept in the app's settings: its value, and a setter that saves it. */
function useStored<T>(bridge: HomeBridge, key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    void bridge.readSetting<T>(key).then((saved) => saved !== undefined && setValue(saved));
  }, [bridge, key]);
  return [
    value,
    (next) => {
      setValue(next);
      void bridge.writeSetting(key, next);
    },
  ];
}

/**
 * The main window (preview of the redesign), on the rules of the team's Shapeshift: the window's title row, a side
 * navigation with labels and the settings at its foot, one narrow column of content, one kind of container (the
 * card), rows «as in the Windows settings», one accent, and «Подробно» for what most do not need. What acts on the
 * game (the calculator, the AI, the overlay's sections) is asked of the overlay, as the quick search asks it.
 */
export function HomeWindow({ bridge }: { bridge: HomeBridge }) {
  const laws = useHomeLaws(bridge);
  const [section, setSection] = useState<Section>('today');
  const [mica, setMica] = useState(false);
  const [detailed, setDetailed] = useStored(bridge, DETAILED_KEY, false);
  useEffect(() => {
    void bridge.mica().then(setMica);
  }, [bridge]);

  // The selection's mark glides to the section chosen.
  const nav = useRef<HTMLDivElement>(null);
  const [mark, setMark] = useState<number | null>(null);
  useEffect(() => {
    const on = nav.current?.querySelector<HTMLElement>(`[data-section="${section}"]`);
    setMark(on ? on.offsetTop + on.offsetHeight / 2 - 8 : null);
  }, [section, laws]);

  const organization = laws ? laws.pack.organizations.find((o) => o.id === laws.profile.organization) : undefined;
  const can = useMemo(() => aiCapabilitiesOf({ admin: false, organization }), [organization]);
  const place = laws ? [laws.pack.server.name, organization?.kind ? organization.name : null].filter(Boolean).join(' · ') : '';
  const navItem = (id: Section, label: string) => (
    <button key={id} type="button" data-section={id} aria-current={section === id ? 'page' : undefined} onClick={() => setSection(id)}>
      {HOME_ICONS[id]}
      <span>{label}</span>
    </button>
  );

  return (
    <div className={mica ? 'home home--mica' : 'home'}>
      <Edges bridge={bridge} />
      <header className="home__titlebar" data-tauri-drag-region>
        <span className="home__mark" aria-hidden="true">
          ★
        </span>
        <span className="home__appname" data-tauri-drag-region>
          Кремлёвский Ассистент
        </span>
        {place && (
          <span className="home__place" data-tauri-drag-region>
            {place}
          </span>
        )}
        <span className="home__badge">Превью</span>
        <div className="home__controls">
          <button type="button" aria-label="Свернуть" onClick={bridge.minimize}>
            {HOME_ICONS.minimize}
          </button>
          <button type="button" aria-label="Развернуть" onClick={bridge.toggleMaximize}>
            {HOME_ICONS.maximize}
          </button>
          <button type="button" className="home__close" aria-label="Закрыть" onClick={bridge.hide}>
            {HOME_ICONS.close}
          </button>
        </div>
      </header>

      <div className="home__body">
        <nav className="home__pane" aria-label="Разделы">
          <div className="home__nav" ref={nav}>
            {mark !== null && <span className="home__indicator" style={{ transform: `translateY(${mark}px)` }} aria-hidden="true" />}
            {SECTIONS.filter((s) => s.id !== 'duty' || can.has('ai.practice') || can.has('ai.check')).map((s) => navItem(s.id, s.label))}
            <span className="home__grow" />
            <label className="home__detail">
              <span>
                Подробно
                <small>главы, подследственность, примечания</small>
              </span>
              <Switch on={detailed} label="Подробно" onChange={setDetailed} />
            </label>
            {navItem('settings', 'Настройки')}
          </div>
        </nav>

        <main className="home__content">
          {laws === undefined ? null : laws === null ? (
            <Page title="Сначала выберите сервер" subtitle="Откройте ассистента поверх игры (Alt+Q) и выберите сервер и организацию — главное окно возьмёт их оттуда." />
          ) : (
            <div className="home__view" key={section}>
              {section === 'today' && <Today bridge={bridge} laws={laws} go={setSection} />}
              {section === 'laws' && <LawsView bridge={bridge} laws={laws} detailed={detailed} />}
              {section === 'ai' && <AiView bridge={bridge} />}
              {section === 'duty' && <DutyView bridge={bridge} can={can} />}
              {section === 'wiki' && <WikiView bridge={bridge} />}
              {section === 'settings' && <SettingsView bridge={bridge} mica={mica} detailed={detailed} onDetailed={setDetailed} />}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

/** Invisible strips along the frameless window's edges that resize it. */
function Edges({ bridge }: { bridge: HomeBridge }) {
  const edges: [ResizeEdge, string][] = [
    ['North', 'n'],
    ['South', 's'],
    ['East', 'e'],
    ['West', 'w'],
    ['NorthWest', 'nw'],
    ['NorthEast', 'ne'],
    ['SouthWest', 'sw'],
    ['SouthEast', 'se'],
  ];
  return (
    <>
      {edges.map(([edge, cls]) => (
        <div key={edge} className={`home__edge home__edge--${cls}`} aria-hidden="true" onPointerDown={(e) => e.button === 0 && bridge.startResize(edge)} />
      ))}
    </>
  );
}

function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: (on: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className="home-switch" onClick={() => onChange(!on)} />;
}

/** A page: its title and one line under it, then its cards. */
function Page({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <>
      <header className="home-page">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </header>
      {children}
    </>
  );
}

/** The one container of the interface. */
function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="home-card" aria-label={title}>
      {title && <h2>{title}</h2>}
      {children}
    </section>
  );
}

/** A row as in the Windows settings: what and why on the left, the control on the right. */
function Row({ title, hint, children, onClick }: { title: ReactNode; hint?: ReactNode; children?: ReactNode; onClick?: () => void }) {
  const body = (
    <>
      <span className="home-row__text">
        <span className="home-row__title">{title}</span>
        {hint && <span className="home-row__hint">{hint}</span>}
      </span>
      {children}
    </>
  );
  return onClick ? (
    <button type="button" className="home-row home-row--action" onClick={onClick}>
      {body}
      <span className="home-row__chevron" aria-hidden="true">
        ›
      </span>
    </button>
  ) : (
    <div className="home-row">{body}</div>
  );
}

// ——— Сегодня ———

function Today({ bridge, laws, go }: { bridge: HomeBridge; laws: Laws; go: (section: Section) => void }) {
  const { pack } = laws;
  const lookup = useHitLookup(pack);
  const [favorites, setFavorites] = useState<SearchHit[]>([]);
  const [recent, setRecent] = useState<SearchHit[]>([]);
  const [cases, setCases] = useState<{ id: string; title: string; updated: string }[]>([]);
  useEffect(() => {
    const hits = (keys: string[] | undefined) => (keys ?? []).map(lookup).filter((hit) => hit !== undefined);
    void bridge.readSetting<string[]>(favoritesKey(pack.server.id)).then((keys) => setFavorites(hits(keys).slice(0, 4)));
    void bridge.readSetting<string[]>(recentKey(pack.server.id)).then((keys) => setRecent(hits(keys).slice(0, 4)));
    void bridge
      .readSetting<{ id: string; title: string; updated: string; archived?: boolean }[]>(historyKey(pack.server.id))
      .then((saved) => setCases((saved ?? []).filter((c) => !c.archived).slice(0, 3)));
  }, [bridge, pack, lookup]);
  const changes = useMemo(() => recentChanges(pack, new Date(), 14), [pack]);
  const today = new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  const articles = [...favorites, ...recent.filter((r) => !favorites.some((f) => hitKey(f) === hitKey(r)))].slice(0, 5);

  return (
    <Page title="Сегодня" subtitle={`${today[0].toUpperCase()}${today.slice(1)} · что изменилось и что под рукой`}>
      <Card title="Изменилось в законах за две недели">
        {changes.length ? (
          changes.slice(0, 3).flatMap((entry) =>
            entry.documents.slice(0, 2).map((d) => (
              <Row
                key={`${entry.version}-${d.documentId}`}
                title={d.title}
                hint={`${dateOf(entry.version)} · ${d.kind === 'added' ? 'добавлен' : d.kind === 'removed' ? 'убран' : `изменено статей: ${d.articles.length}`}`}
              />
            )),
          )
        ) : (
          <p className="home-muted">За две недели законы вашего сервера не менялись.</p>
        )}
      </Card>
      <Survey bridge={bridge} />
      <Card title="Ваши статьи">
        {articles.length ? (
          articles.map((hit) => <HitRow key={hitKey(hit)} hit={hit} />)
        ) : (
          <p className="home-muted">Избранные и недавние статьи появятся здесь.</p>
        )}
      </Card>
      <Card title="Дела и разговоры с ИИ">
        {cases.map((c) => (
          <Row key={c.id} title={c.title || 'Без названия'} hint={dateOf(c.updated)} />
        ))}
        <Row title="Открыть ИИ" hint="Новый разбор или продолжить прошлый" onClick={() => go('ai')} />
      </Card>
    </Page>
  );
}

function HitRow({ hit, onClick, current }: { hit: SearchHit; onClick?: () => void; current?: boolean }) {
  const part = entryPart(hit.article, hit.part) ?? hit.part ?? hit.article.parts.find((p) => p.punishment);
  const body = (
    <>
      <span className="home-row__text">
        <span className="home-row__title">
          {hitTitle(hit)} · {hit.article.title || 'без названия'}
        </span>
        {part?.punishment && <span className="home-row__hint">{formatPunishment(part.punishment)}</span>}
      </span>
      <span className="home-stars">{starsOf(part)}</span>
    </>
  );
  return onClick ? (
    <button type="button" className="home-row home-row--action" aria-current={current ? 'true' : undefined} onClick={onClick}>
      {body}
      <span className="home-row__chevron" aria-hidden="true">
        ›
      </span>
    </button>
  ) : (
    <div className="home-row">{body}</div>
  );
}

/** One short question, answered or not as the player likes (the team's ask): in the preview it stays on this computer. */
function Survey({ bridge }: { bridge: HomeBridge }) {
  const [answer, setAnswer] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    void bridge.readSetting<string>(SURVEY_KEY).then((saved) => setAnswer(saved ?? null));
  }, [bridge]);
  const choose = (value: string) => {
    setAnswer(value);
    void bridge.writeSetting(SURVEY_KEY, value);
  };
  if (answer === undefined || answer === 'Не спрашивать') return null;
  return (
    <Card title="Короткий вопрос · необязательно">
      {answer ? (
        <p className="home-thanks">Спасибо! Ваш ответ: «{answer}».</p>
      ) : (
        <>
          <p className="home-question">Чувствуете ли просадки FPS, когда Ассистент открыт поверх игры?</p>
          <div className="home-options">
            {SURVEY_ANSWERS.map((value) => (
              <button key={value} type="button" onClick={() => choose(value)}>
                {value}
              </button>
            ))}
            <button type="button" className="home-options__skip" onClick={() => choose('Не спрашивать')}>
              Не спрашивать
            </button>
          </div>
        </>
      )}
      <p className="home-note">В превью ответ остаётся на этом компьютере.</p>
    </Card>
  );
}

// ——— Законы ———

function LawsView({ bridge, laws, detailed }: { bridge: HomeBridge; laws: Laws; detailed: boolean }) {
  const { pack } = laws;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<SearchHit | null>(null);
  const [everywhereFor, setEverywhereFor] = useState<string | null>(null);
  const boostDocuments = pack.organizations.find((o) => o.id === laws.profile.organization)?.documents;
  const found = useMemo<{ hits: SearchHit[]; intent?: Intent }>(
    () => (query.trim() ? searchUnderstood(pack, query, { boostDocuments, everywhere: everywhereFor === query }) : { hits: [] }),
    [pack, query, boostDocuments, everywhereFor],
  );
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) input.current?.focus();
  }, [open]);

  if (open) return <ArticlePage hit={open} bridge={bridge} detailed={detailed} onBack={() => setOpen(null)} />;
  return (
    <Page title="Законы" subtitle={`${pack.documents.length} документов сервера ${pack.server.name}. Номер, слова или вопрос своими словами.`}>
      <label className="home-search">
        {HOME_ICONS.search}
        <input
          ref={input}
          type="search"
          value={query}
          placeholder="65, коап 8.6, что будет за угон"
          aria-label="Поиск по законам"
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {found.intent && (
        <p className="home-understood">
          Понял как: <b>{found.intent.label}</b> ·{' '}
          <button type="button" className="home-link" onClick={() => setEverywhereFor(query)}>
            Искать везде
          </button>
        </p>
      )}
      {query.trim() && (
        <Card>
          {found.hits.length ? (
            found.hits.slice(0, 30).map((hit) => <HitRow key={hitKey(hit)} hit={hit} onClick={() => setOpen(hit)} />)
          ) : (
            <p className="home-muted">Ничего не нашлось. Попробуйте другое слово или спросите ИИ.</p>
          )}
        </Card>
      )}
    </Page>
  );
}

function ArticlePage({ hit, bridge, detailed, onBack }: { hit: SearchHit; bridge: HomeBridge; detailed: boolean; onBack: () => void }) {
  const { article, document } = hit;
  const [selected, setSelected] = useState<Part | undefined>(hit.part ?? article.parts.find((p) => p.punishment));
  const [sent, setSent] = useState<string | null>(null);
  const chapter = article.chapter ? document.chapters.find((c) => c.number === article.chapter) : undefined;
  const charge = (part: Part) => {
    const key = hitKey({ article, document, part });
    void bridge.request({ kind: 'charge', key });
    setSent(key);
  };
  return (
    <>
      <nav className="home-crumbs" aria-label="Путь">
        <button type="button" className="home-link" onClick={onBack}>
          Законы
        </button>
        <span aria-hidden="true">›</span>
        <span>{hitTitle({ article, document })}</span>
      </nav>
      <Page title={articleHeading(article, document.unit)} subtitle={detailed && chapter ? `${document.title} · ${chapterHeading(chapter)}` : document.title} />
      <Card>
        {article.parts.map((part, i) => {
          const key = hitKey({ article, document, part });
          const on = part === selected;
          return (
            <div
              key={part.number ?? i}
              className={on ? 'home-part home-part--on' : 'home-part'}
              tabIndex={0}
              aria-current={on ? 'true' : undefined}
              onClick={() => setSelected(part)}
              onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && setSelected(part)}
            >
              <span className="home-part__num">{part.number ?? ''}</span>
              <div className="home-part__body">
                <p>{part.text}</p>
                {part.points.map((point) => (
                  <p key={point.marker} className="home-part__point">
                    {point.marker}) {point.text}
                  </p>
                ))}
                {part.punishment && (
                  <p className="home-part__pen">
                    <span className="home-stars">{starsOf(part)}</span> {formatPunishment(part.punishment)}
                  </p>
                )}
                {detailed && part.jurisdiction?.length ? <p className="home-part__meta">Подследственность: {jurisdictionText(part.jurisdiction)}</p> : null}
              </div>
              {on && part.punishment && (
                <button className="home-btn" type="button" onClick={() => charge(part)}>
                  {sent === key ? 'В калькуляторе ✓' : 'В калькулятор'}
                </button>
              )}
            </div>
          );
        })}
      </Card>
      {detailed && article.notes.length > 0 && (
        <Card title="Примечание">
          {article.notes.map((note, i) => (
            <p key={i} className="home-part__meta">
              {note.text}
            </p>
          ))}
        </Card>
      )}
      {sent && <p className="home-note">Статья в калькуляторе поверх игры — откройте его клавишей Alt+Q.</p>}
    </>
  );
}

// ——— ИИ, Служба, Вики ———

function AiView({ bridge }: { bridge: HomeBridge }) {
  const [question, setQuestion] = useState('');
  const ask = () => question.trim() && void bridge.request({ kind: 'ask', question: question.trim() });
  return (
    <Page title="ИИ" subtitle="Опишите ситуацию — ИИ найдёт статьи вашего сервера. Ответ откроется в ассистенте поверх игры.">
      <Card>
        <textarea
          className="home-textarea"
          value={question}
          rows={4}
          placeholder="Например: человек в маске с электродубинкой стоит у здания МВД — что ему грозит?"
          aria-label="Вопрос ИИ"
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) ask();
          }}
        />
        <div className="home-actions">
          <button className="home-btn home-btn--plain" type="button" onClick={() => void bridge.request({ kind: 'open', to: 'history' })}>
            История разборов
          </button>
          <button className="home-btn" type="button" disabled={!question.trim()} onClick={ask}>
            Спросить ИИ
          </button>
        </div>
      </Card>
    </Page>
  );
}

function DutyView({ bridge, can }: { bridge: HomeBridge; can: ReadonlySet<string> }) {
  const open = (request: QuickRequest) => void bridge.request(request);
  const items: { title: string; hint: string; request: QuickRequest; show: boolean }[] = [
    { title: 'Тренажёр', hint: 'Быстрые задания по законам вашего сервера и экзамен с ИИ', request: { kind: 'open', to: 'trainer' }, show: can.has('ai.practice') },
    { title: 'Проверка задержания', hint: 'ИИ сверит каждый шаг с законом', request: { kind: 'open', to: 'detention' }, show: can.has('ai.check') },
    { title: 'Требования адвоката', hint: 'Законны ли требования защитника', request: { kind: 'open', to: 'lawyer' }, show: can.has('ai.check') },
    { title: 'Документы', hint: 'Рапорт, протокол, заявление — с вашими данными и статьями', request: { kind: 'open', to: 'document' }, show: true },
    { title: 'Памятки фракции', hint: 'От лидера и заместителей', request: { kind: 'open', to: 'memos' }, show: true },
  ];
  return (
    <Page title="Служба" subtitle="Инструменты сотрудника. Открываются в ассистенте поверх игры.">
      <Card>
        {items
          .filter((item) => item.show)
          .map((item) => (
            <Row key={item.title} title={item.title} hint={item.hint} onClick={() => open(item.request)} />
          ))}
      </Card>
    </Page>
  );
}

function WikiView({ bridge }: { bridge: HomeBridge }) {
  return (
    <Page title="Вики" subtitle="Транспорт, персонаж, имущество, предметы и крафт. Данные: вики Russia Online.">
      <Card>
        <Row title="Открыть вики" hint="В превью — в ассистенте поверх игры; в новом облике переедет сюда" onClick={() => void bridge.request({ kind: 'open', to: 'wiki' })} />
      </Card>
    </Page>
  );
}

// ——— Настройки ———

function SettingsView({ bridge, mica, detailed, onDetailed }: { bridge: HomeBridge; mica: boolean; detailed: boolean; onDetailed: (on: boolean) => void }) {
  const [reports, setReports] = useStored(bridge, REPORTS_KEY, true);
  return (
    <Page title="Настройки" subtitle="Превью: настройки нового облика. Остальные — в ассистенте поверх игры.">
      <Card title="Вид">
        <Row title="Подробно" hint="Глава, подследственность каждой части и примечания к статьям">
          <Switch on={detailed} label="Подробно" onChange={onDetailed} />
        </Row>
        <Row title="Фон окна" hint={mica ? 'Системный Mica Windows 11 — слегка просвечивают обои' : 'Mica есть только в Windows 11 — здесь свой фон'} />
      </Card>
      <Card title="Приватность">
        <Row title="Отправлять отчёты об ошибках" hint="Версия, Windows, где и что сломалось. Без ваших текстов, запросов и скриншотов. В превью ничего не отправляется.">
          <Switch on={reports} label="Отправлять отчёты об ошибках" onChange={setReports} />
        </Row>
      </Card>
      <Card>
        <Row title="Все настройки ассистента" hint="Сервер, клавиши, внешний вид оверлея, аккаунт" onClick={() => void bridge.request({ kind: 'open', to: 'settings' })} />
      </Card>
    </Page>
  );
}
