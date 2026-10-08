import { useMemo, type ReactNode } from 'react';
import type { Organization, SearchHit, ServerPack } from '../core';
import { CHARTER_TITLES, charterCards, type CharterCard, type CharterDigest } from '../core/charter';
import { topicArticles, topicsFor } from '../core/topics';
import digests from '../data/charters.json';
import { BackIcon, TopicIcon } from './icons';

const DIGESTS = digests as unknown as Record<string, CharterDigest>;

/** «1 статья», «3 статьи», «94 статьи»… «25 статей». */
function articles(n: number): string {
  const ten = n % 10;
  const hundred = n % 100;
  const word = ten === 1 && hundred !== 11 ? 'статья' : ten >= 2 && ten <= 4 && (hundred < 12 || hundred > 14) ? 'статьи' : 'статей';
  return `${n} ${word}`;
}

export interface DepartmentViewProps {
  pack: ServerPack;
  organization: Organization | undefined;
  /** The topic open, or null for the whole page. */
  topic: string | null;
  onTopic: (topic: string | null) => void;
  /** A row of the list, as the search draws it: it opens the article and puts it into the calculator. */
  row: (hit: SearchHit) => ReactNode;
  onOrganization: () => void;
  /** A point of the charter, opened as an article. */
  onOpen: (hit: SearchHit) => void;
  onCopy: (text: string) => void;
  /** What is at hand over the game for the faction — the detention timer, the phrases for the chat — above the rest. */
  tools?: ReactNode;
}

/** «Отдел»: what the player's organisation does by the law of their server. */
export function DepartmentView({ pack, organization, topic, onTopic, row, onOrganization, onOpen, onCopy, tools }: DepartmentViewProps) {
  const topics = useMemo(
    () => topicsFor(organization).map((t) => ({ ...t, hits: topicArticles(pack, t.id, organization?.documents) })).filter((t) => t.hits.length),
    [pack, organization],
  );
  const open = topics.find((t) => t.id === topic);
  const cards = useMemo(() => charterCards(pack, DIGESTS[pack.server.id], organization?.id), [pack, organization]);

  if (open) {
    return (
      <div className="dept">
        <div className="dept__head">
          <button className="icon-btn icon-btn--sm" type="button" aria-label="Назад к отделу" title="Назад" onClick={() => onTopic(null)}>
            <BackIcon />
          </button>
          <div>
            <b>{open.title}</b>
            <span className="dept__sub">
              {open.hint} · {articles(open.hits.length)} сервера {pack.server.name}
            </span>
          </div>
        </div>
        <div className="list" role="list" aria-label={open.title}>
          {open.hits.map((hit) => (
            <div role="listitem" key={hit.article.id}>
              {row(hit)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="dept">
      {tools}
      {topics.length > 0 && (
        <section aria-label="Как это делается по закону">
          <div className="sec-t">
            Как это делается по закону <span className="dept__sub">· статьи сервера {pack.server.name} для «{organization!.name}»</span>
          </div>
          <div className="dept__topics">
            {topics.map((t) => (
              <button key={t.id} className={`dept__topic dept__topic--${t.id}`} type="button" onClick={() => onTopic(t.id)}>
                <span className="dept__ico" aria-hidden="true">
                  <TopicIcon id={t.id} />
                </span>
                <span className="dept__ttl">
                  <b>{t.title}</b>
                  <span>{t.hint}</span>
                  <small>{articles(t.hits.length)}</small>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
      {cards.length > 0 && <Charter cards={cards} name={organization!.name} onOpen={onOpen} onCopy={onCopy} />}
      {!topics.length && !cards.length && !tools && (
        <div className="empty">
          {organization && organization.id !== 'none' ? (
            <>Для «{organization.name}» на сервере {pack.server.name} здесь пока нечего показать.</>
          ) : (
            <>
              Выберите организацию — здесь появится порядок действий по законам вашего сервера.{' '}
              <button className="link" type="button" onClick={onOrganization}>
                Выбрать
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** The charter in short: a card a section, each with the points it rests on. */
function Charter({ cards, name, onOpen, onCopy }: { cards: CharterCard[]; name: string; onOpen: (hit: SearchHit) => void; onCopy: (text: string) => void }) {
  const sources = [...new Set(cards.map((card) => card.source))];
  return (
    <section aria-label="Устав">
      <div className="sec-t">
        Устав <span className="dept__sub">· «{name}» коротко — пункты открываются целиком</span>
      </div>
      <div className="dept__cards">
        {cards.map((card) => (
          <article key={card.kind} className="dept__card" aria-label={CHARTER_TITLES[card.kind]}>
            <h3>{CHARTER_TITLES[card.kind]}</h3>
            <div className="dept__body">
              {card.items &&
                (card.kind === 'ranks' ? (
                  <ol className="dept__ranks">
                    {card.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ol>
                ) : card.items.every((item) => !item.includes(' — ')) ? (
                  // Penalties go from the mildest: a line of steps reads at a glance.
                  <p>{card.items.join(' → ')}</p>
                ) : (
                  <ul className="md__list">
                    {card.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ))}
              {card.text && <p>{card.text}</p>}
              <div className="dept__refs">
                {card.articles.map((article) => (
                  <button key={article.id} className="link" type="button" onClick={() => onOpen({ article, document: card.source })}>
                    п. {article.number}
                  </button>
                ))}
                {card.kind === 'address' && card.text && (
                  <button className="link" type="button" onClick={() => onCopy(card.text!)}>
                    Скопировать
                  </button>
                )}
              </div>
              {card.stale && <p className="dept__stale">Устав изменили после этой выжимки — сверьтесь с пунктами.</p>}
            </div>
          </article>
        ))}
      </div>
      <p className="dept__note">
        Выжимка из {sources.map((d) => `«${d.title}»`).join(', ')}. Решает текст устава: откройте пункт, если важна точность.
      </p>
    </section>
  );
}
