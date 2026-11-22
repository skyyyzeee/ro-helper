import type { ReactNode } from 'react';

interface HomeDashboardProps {
  favorites: ReactNode;
  favoriteCount: number;
  recent: ReactNode;
  recentCount: number;
  popular: ReactNode;
  popularCount: number;
  boosts: ReactNode;
  onClearRecent: () => void;
}

/** Personal documents stay first; server-wide suggestions occupy the secondary column. */
export function HomeDashboard(props: HomeDashboardProps) {
  return (
    <div className="home-dashboard">
      <div className="home-dashboard__personal">
        <section className="home-dashboard__section" aria-labelledby="home-favorites">
          <div className="home-dashboard__heading">
            <h2 id="home-favorites">Избранное</h2>
            <span className="home-dashboard__count" aria-hidden="true">{props.favoriteCount}</span>
          </div>
          {props.favoriteCount ? (
            <div className="list list--tiles" role="list" aria-label="Избранное">{props.favorites}</div>
          ) : (
            <p className="home-dashboard__empty">Добавьте нужные статьи в избранное — кнопка со звездой находится в открытой статье.</p>
          )}
        </section>
        <section className="home-dashboard__section" aria-labelledby="home-recent">
          <div className="home-dashboard__heading">
            <h2 id="home-recent">Недавние</h2>
            <span className="home-dashboard__count" aria-hidden="true">{props.recentCount}</span>
            {props.recentCount > 0 && <button className="link-btn home__clear" type="button" aria-label="Очистить недавние" onClick={props.onClearRecent}>Очистить</button>}
          </div>
          {props.recentCount ? (
            <div className="list" role="list" aria-label="Недавние">{props.recent}</div>
          ) : (
            <p className="home-dashboard__empty">Здесь будут статьи, которые вы открывали на этом сервере.</p>
          )}
        </section>
      </div>
      <aside className="home-dashboard__secondary" aria-label="На сервере">
        {props.popularCount > 0 && (
          <section className="home-dashboard__section" aria-labelledby="home-popular">
            <div className="home-dashboard__heading"><h2 id="home-popular">Популярное у игроков</h2></div>
            <div className="list" role="list" aria-label="Популярное у игроков">{props.popular}</div>
          </section>
        )}
        {props.boosts}
      </aside>
    </div>
  );
}
