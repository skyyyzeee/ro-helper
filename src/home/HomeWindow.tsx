import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { aiCapabilitiesOf } from '../account/capabilities';
import {
  articleHeading,
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
import { isNewer, readPack } from '../ui/laws';
import { PROFILE_KEY, type Profile } from '../ui/profile';
import { entryPart, favoritesKey, hitKey, recentKey, useHitLookup } from '../ui/saved';
import { HOME_ICONS } from './icons';
import './fonts.css';
import './home.css';

type Section = 'today' | 'laws' | 'ai' | 'duty' | 'wiki' | 'settings';
const SECTIONS: { id: Section; label: string }[] = [
  { id: 'today', label: 'Сегодня' },
  { id: 'laws', label: 'Законы' },
  { id: 'ai', label: 'ИИ' },
  { id: 'duty', label: 'Служба' },
  { id: 'wiki', label: 'Вики' },
  { id: 'settings', label: 'Настройки' },
];

/** The fonts the preview offers: the team's choice first (Inter, digits in Manrope), the others to compare. */
const FONTS = ['Kremlin', 'Onest', 'Segoe UI Variable'] as const;
const FONT_NAMES: Record<Font, string> = { Kremlin: 'Inter + Manrope', Onest: 'Onest', 'Segoe UI Variable': 'Segoe UI' };
type Font = (typeof FONTS)[number];
const FONT_KEY = 'home.font';
const SURVEY_KEY = 'home.survey';
const REPORTS_KEY = 'home.reports';

const SURVEY_ANSWERS = ['Нет, не замечаю', 'Иногда, при открытии', 'Да, заметно', 'Не играю с ним открытым'];

/** The articles a key stands for, or nothing when the laws no longer have it. */
const starsOf = (part?: Part) => (part?.stars ? '★'.repeat(part.stars.max) : '');
const dateOf = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

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

/**
 * The main window (preview of the redesign): an ordinary window, away from the game, in the look of the prototype —
 * a translucent side column, large titles, calm cards. What acts on the game (the calculator, the AI, the sections
 * of the overlay) is asked of the overlay, as the quick search asks it.
 */
export function HomeWindow({ bridge }: { bridge: HomeBridge }) {
  const laws = useHomeLaws(bridge);
  const [section, setSection] = useState<Section>('today');
  const [mica, setMica] = useState(false);
  const [font, setFont] = useState<Font>('Kremlin');
  useEffect(() => {
    void bridge.mica().then(setMica);
    void bridge.readSetting<Font>(FONT_KEY).then((saved) => saved && FONTS.includes(saved) && setFont(saved));
  }, [bridge]);
  const chooseFont = (next: Font) => {
    setFont(next);
    void bridge.writeSetting(FONT_KEY, next);
  };

  // The selection's pill glides to the section chosen.
  const nav = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState(0);
  useEffect(() => {
    const on = nav.current?.querySelector<HTMLElement>(`[data-section="${section}"]`);
    if (on) setPill(on.offsetTop);
  }, [section]);

  const organization = laws ? laws.pack.organizations.find((o) => o.id === laws.profile.organization) : undefined;
  const can = useMemo(() => aiCapabilitiesOf({ admin: false, organization }), [organization]);

  return (
    <div className={mica ? 'home home--mica' : 'home'} style={{ '--home-font': `'${font}'` } as React.CSSProperties}>
      <Edges bridge={bridge} />
      <aside className="home__side">
        <div className="home__titlebar" data-tauri-drag-region>
          <span className="home__mark" aria-hidden="true">
            ★
          </span>
          <div data-tauri-drag-region>
            <b>Кремлёвский Ассистент</b>
            <small>{laws ? [laws.pack.server.name, organization?.kind ? organization.name : null].filter(Boolean).join(' · ') : 'Превью нового облика'}</small>
          </div>
        </div>
        <nav className="home__nav" ref={nav} aria-label="Разделы">
          <span className="home__pill" style={{ transform: `translateY(${pill}px)` }} aria-hidden="true" />
          {SECTIONS.filter((s) => s.id !== 'duty' || can.has('ai.practice') || can.has('ai.check')).map((s) => (
            <button key={s.id} type="button" data-section={s.id} aria-current={section === s.id ? 'page' : undefined} onClick={() => setSection(s.id)}>
              {HOME_ICONS[s.id]}
              <span>{s.label}</span>
            </button>
          ))}
        </nav>
        <div className="home__grow" data-tauri-drag-region />
        <p className="home__hint">
          <kbd>Alt</kbd> <kbd>Q</kbd> — поверх игры · <kbd>Alt</kbd> <kbd>S</kbd> — быстрый поиск
        </p>
      </aside>
      <main className="home__main">
        <div className="home__bar" data-tauri-drag-region>
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
        </div>
        <div className="home__scroll">
          {laws === undefined ? null : laws === null ? (
            <Empty title="Сначала выберите сервер" text="Откройте ассистента поверх игры (Alt+Q) и выберите сервер и организацию — главное окно возьмёт их оттуда." />
          ) : (
            <div className="home__view" key={section}>
              {section === 'today' && <Today bridge={bridge} laws={laws} go={setSection} />}
              {section === 'laws' && <LawsView bridge={bridge} laws={laws} />}
              {section === 'ai' && <AiView bridge={bridge} />}
              {section === 'duty' && <DutyView bridge={bridge} can={can} />}
              {section === 'wiki' && <WikiView bridge={bridge} />}
              {section === 'settings' && <SettingsView bridge={bridge} font={font} onFont={chooseFont} mica={mica} />}
            </div>
          )}
        </div>
      </main>
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

function Title({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <header className="home__title">
      <h1>{children}</h1>
      {note && <small>{note}</small>}
    </header>
  );
}

function Card({ title, children, wide }: { title: string; children: ReactNode; wide?: boolean }) {
  return (
    <section className={wide ? 'home-card home-card--wide' : 'home-card'} aria-label={title}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="home__empty">
      <b>{title}</b>
      <p>{text}</p>
    </div>
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

  return (
    <>
      <Title note={today}>Сегодня</Title>
      <div className="home__grid">
        <Card title="Изменилось в законах за две недели">
          {changes.length ? (
            <ul className="home-list">
              {changes.slice(0, 4).flatMap((entry) =>
                entry.documents.slice(0, 2).map((d) => (
                  <li key={`${entry.version}-${d.documentId}`}>
                    <div>
                      <b>{d.title}</b>
                      <small>
                        {dateOf(entry.version)} · {d.kind === 'added' ? 'добавлен' : d.kind === 'removed' ? 'убран' : `изменено статей: ${d.articles.length}`}
                      </small>
                    </div>
                    <span className="home-tag">{d.short}</span>
                  </li>
                )),
              )}
            </ul>
          ) : (
            <p className="home-muted">За две недели законы вашего сервера не менялись.</p>
          )}
        </Card>
        <Survey bridge={bridge} />
        <Card title="Избранное">
          {favorites.length ? <HitList hits={favorites} /> : <p className="home-muted">Отмечайте статьи звёздочкой — они появятся здесь.</p>}
        </Card>
        <Card title="Недавние статьи">{recent.length ? <HitList hits={recent} /> : <p className="home-muted">Здесь будут статьи, которые вы открывали.</p>}</Card>
        <Card title="Дела и разговоры с ИИ">
          {cases.length ? (
            <ul className="home-list">
              {cases.map((c) => (
                <li key={c.id}>
                  <div>
                    <b>{c.title || 'Без названия'}</b>
                    <small>{dateOf(c.updated)}</small>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="home-muted">Разборы ИИ сохранятся здесь.</p>
          )}
          <button className="home-btn home-btn--ghost" type="button" onClick={() => go('ai')}>
            Открыть ИИ
          </button>
        </Card>
      </div>
    </>
  );
}

function HitList({ hits }: { hits: SearchHit[] }) {
  return (
    <ul className="home-list">
      {hits.map((hit) => {
        const part = entryPart(hit.article, hit.part) ?? hit.article.parts.find((p) => p.punishment);
        return (
          <li key={hitKey(hit)}>
            <div>
              <b>
                {hit.document.short} ст. {hit.article.number}
                {hit.part?.number ? ` ч. ${hit.part.number}` : ''} · {hit.article.title}
              </b>
              {part?.punishment && <small className="home-pen">{formatPunishment(part.punishment)}</small>}
            </div>
            <span className="home-stars">{starsOf(part)}</span>
          </li>
        );
      })}
    </ul>
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
          <b className="home-question">Чувствуете ли просадки FPS, когда Ассистент открыт поверх игры?</b>
          <div className="home-options">
            {SURVEY_ANSWERS.map((value) => (
              <button key={value} type="button" onClick={() => choose(value)}>
                {value}
              </button>
            ))}
          </div>
          <button className="home-btn home-btn--ghost" type="button" onClick={() => choose('Не спрашивать')}>
            Не спрашивать
          </button>
        </>
      )}
      <p className="home-note">В превью ответ остаётся на этом компьютере.</p>
    </Card>
  );
}

// ——— Законы ———

function LawsView({ bridge, laws }: { bridge: HomeBridge; laws: Laws }) {
  const { pack } = laws;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<{ article: Article; document: LawDocument; part?: Part } | null>(null);
  const [everywhereFor, setEverywhereFor] = useState<string | null>(null);
  const boostDocuments = pack.organizations.find((o) => o.id === laws.profile.organization)?.documents;
  const found = useMemo<{ hits: SearchHit[]; intent?: Intent }>(
    () => (query.trim() ? searchUnderstood(pack, query, { boostDocuments, everywhere: everywhereFor === query }) : { hits: [] }),
    [pack, query, boostDocuments, everywhereFor],
  );
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  return (
    <>
      <Title note={`${pack.documents.length} документов · ${pack.server.name}`}>Законы</Title>
      <label className="home-search">
        {HOME_ICONS.search}
        <input
          ref={input}
          type="search"
          value={query}
          placeholder="Номер или слова: 65, коап 8.6, что будет за угон"
          aria-label="Поиск по законам"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(null);
          }}
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
      <div className={open ? 'home-split home-split--open' : 'home-split'}>
        <div className="home-card home-card--list">
          {query.trim() ? (
            found.hits.length ? (
              <ul className="home-list home-list--click">
                {found.hits.slice(0, 30).map((hit) => {
                  const part = hit.part ?? hit.article.parts.find((p) => p.punishment);
                  return (
                    <li key={hitKey(hit)}>
                      <button type="button" aria-current={open?.article === hit.article && open.part === hit.part ? 'true' : undefined} onClick={() => setOpen(hit)}>
                        <div>
                          <b>
                            {hit.document.short} ст. {hit.article.number}
                            {hit.part?.number ? ` ч. ${hit.part.number}` : ''} · {hit.article.title || 'без названия'}
                          </b>
                          {part?.punishment && <small className="home-pen">{formatPunishment(part.punishment)}</small>}
                        </div>
                        <span className="home-stars">{starsOf(part)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="home-muted">Ничего не нашлось. Попробуйте другое слово или спросите ИИ.</p>
            )
          ) : (
            <p className="home-muted">Начните вводить — результаты появятся сразу. Поиск понимает «что будет за кражу», номера и жаргон.</p>
          )}
        </div>
        {open && <ArticlePane hit={open} bridge={bridge} onClose={() => setOpen(null)} />}
      </div>
    </>
  );
}

function ArticlePane({ hit, bridge, onClose }: { hit: { article: Article; document: LawDocument; part?: Part }; bridge: HomeBridge; onClose: () => void }) {
  const { article, document } = hit;
  const [sent, setSent] = useState<string | null>(null);
  const charge = (part: Part) => {
    const key = hitKey({ article, document, part });
    void bridge.request({ kind: 'charge', key });
    setSent(key);
  };
  return (
    <article className="home-card home-article" aria-label={articleHeading(article, document.unit)}>
      <header>
        <span className="home-tag">{document.short}</span>
        <button type="button" className="home-link" onClick={onClose}>
          Закрыть
        </button>
      </header>
      <h2 className="home-article__title">{articleHeading(article, document.unit)}</h2>
      {article.parts.map((part, i) => (
        <section key={part.number ?? i} className={part === hit.part ? 'home-part home-part--focus' : 'home-part'}>
          <p>
            {part.number && <b>{part.number}. </b>}
            {part.text}
          </p>
          {part.points.map((point) => (
            <p key={point.marker} className="home-point">
              {point.marker}) {point.text}
            </p>
          ))}
          {part.punishment && (
            <div className="home-part__pen">
              <span className="home-stars">{starsOf(part)}</span>
              <span>{formatPunishment(part.punishment)}</span>
              <button className="home-btn" type="button" onClick={() => charge(part)}>
                {sent === hitKey({ article, document, part }) ? 'В калькуляторе ✓' : 'В калькулятор'}
              </button>
            </div>
          )}
        </section>
      ))}
      {sent && <p className="home-note">Статья в калькуляторе поверх игры — откройте его клавишей Alt+Q.</p>}
    </article>
  );
}

// ——— ИИ, Служба, Вики ———

function AiView({ bridge }: { bridge: HomeBridge }) {
  const [question, setQuestion] = useState('');
  const ask = () => question.trim() && void bridge.request({ kind: 'ask', question: question.trim() });
  return (
    <>
      <Title note="Разбор · Проверка · Практика">ИИ</Title>
      <Card title="Опишите ситуацию" wide>
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
        <div className="home-row">
          <button className="home-btn" type="button" disabled={!question.trim()} onClick={ask}>
            Спросить ИИ
          </button>
          <button className="home-btn home-btn--ghost" type="button" onClick={() => void bridge.request({ kind: 'open', to: 'history' })}>
            История разборов
          </button>
          <span className="home-note">Ответ откроется в ассистенте поверх игры · Ctrl+Enter</span>
        </div>
      </Card>
    </>
  );
}

function DutyView({ bridge, can }: { bridge: HomeBridge; can: ReadonlySet<string> }) {
  const open = (request: QuickRequest) => void bridge.request(request);
  const items: { title: string; text: string; request: QuickRequest; show: boolean }[] = [
    { title: 'Тренажёр', text: 'Быстрые задания по законам вашего сервера и экзамен с ИИ.', request: { kind: 'open', to: 'trainer' }, show: can.has('ai.practice') },
    { title: 'Проверка задержания', text: 'Расскажите, как прошло задержание, — ИИ сверит каждый шаг с законом.', request: { kind: 'open', to: 'detention' }, show: can.has('ai.check') },
    { title: 'Требования адвоката', text: 'Законны ли требования защитника.', request: { kind: 'open', to: 'lawyer' }, show: can.has('ai.check') },
    { title: 'Документы', text: 'Рапорт, протокол, заявление — с вашими данными и статьями.', request: { kind: 'open', to: 'document' }, show: true },
    { title: 'Памятки фракции', text: 'От лидера и заместителей.', request: { kind: 'open', to: 'memos' }, show: true },
  ];
  return (
    <>
      <Title note="Открывается в ассистенте поверх игры">Служба</Title>
      <div className="home__grid">
        {items
          .filter((item) => item.show)
          .map((item) => (
            <button key={item.title} type="button" className="home-card home-card--action" onClick={() => open(item.request)}>
              <h2>{item.title}</h2>
              <p className="home-muted">{item.text}</p>
            </button>
          ))}
      </div>
    </>
  );
}

function WikiView({ bridge }: { bridge: HomeBridge }) {
  return (
    <>
      <Title note="Данные: вики Russia Online">Вики</Title>
      <Card title="Транспорт, персонаж, имущество, предметы и крафт" wide>
        <p className="home-muted">В превью вики открывается в ассистенте поверх игры. В новом облике она переедет сюда, в главное окно, — места для плиток и картинок здесь больше.</p>
        <button className="home-btn" type="button" onClick={() => void bridge.request({ kind: 'open', to: 'wiki' })}>
          Открыть вики
        </button>
      </Card>
    </>
  );
}

// ——— Настройки ———

function SettingsView({ bridge, font, onFont, mica }: { bridge: HomeBridge; font: Font; onFont: (font: Font) => void; mica: boolean }) {
  const [reports, setReports] = useState(true);
  useEffect(() => {
    void bridge.readSetting<boolean>(REPORTS_KEY).then((saved) => saved !== undefined && setReports(saved));
  }, [bridge]);
  const toggle = () => {
    setReports(!reports);
    void bridge.writeSetting(REPORTS_KEY, !reports);
  };
  return (
    <>
      <Title note="Превью: настройки нового облика">Настройки</Title>
      <Card title="Шрифт" wide>
        <div className="home-segments" role="radiogroup" aria-label="Шрифт">
          {FONTS.map((f) => (
            <button key={f} type="button" role="radio" aria-checked={font === f} style={{ fontFamily: `'${f}', system-ui` }} onClick={() => onFont(f)}>
              {FONT_NAMES[f]}
            </button>
          ))}
        </div>
        <p className="home-note">Inter + Manrope — выбор команды: текст Inter, цифры Manrope. Остальные — для сравнения.</p>
      </Card>
      <Card title="Приватность" wide>
        <div className="home-toggle">
          <div>
            <b>Отправлять отчёты об ошибках</b>
            <small>Версия, Windows, где и что сломалось. Без ваших текстов, запросов и скриншотов. В превью ничего не отправляется.</small>
          </div>
          <button type="button" role="switch" aria-checked={reports} aria-label="Отправлять отчёты об ошибках" className="home-switch" onClick={toggle} />
        </div>
      </Card>
      <Card title="Окно" wide>
        <p className="home-muted">{mica ? 'Фон окна — системный Mica Windows 11: он слегка просвечивает обои.' : 'Системный фон Mica есть только в Windows 11 — здесь окно со своим фоном.'}</p>
        <button className="home-btn home-btn--ghost" type="button" onClick={() => void bridge.request({ kind: 'open', to: 'settings' })}>
          Все настройки ассистента
        </button>
      </Card>
    </>
  );
}
