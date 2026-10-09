import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { LeaderRequest, PlayerRecord, Role } from '../account/roles';
import { SERVER_INFO } from '../data';
import { useRoles } from './roles';

/** «Тверской» for a server's id; the id itself for one this copy doesn't know. */
export const serverName = (server?: string) => (server ? (SERVER_INFO[server]?.server.name ?? server) : '');
/** «МВД» for a faction's id on a server. */
export const factionName = (server?: string, organization?: string) =>
  (organization && server && SERVER_INFO[server]?.organizations.find((o) => o.id === organization)?.name) || organization || '';
/** «Лидер МВД · Тверской» */
export const roleLabel = (role: Pick<Role, 'server' | 'organization'> & { role?: Role['role'] }) =>
  `${role.role === 'deputy' ? 'Заместитель' : 'Лидер'} ${factionName(role.server, role.organization)} · ${serverName(role.server)}`;

/** «Ivan · Ivan_Petrov» — the name they signed in with, and the one they play under. */
function Who({ player }: { player: PlayerRecord }) {
  return (
    <div className="adm__who">
      <b>{player.name || 'Без имени'}</b>
      {player.gameName && ` · ${player.gameName}`}
    </div>
  );
}

/** «Тверской · МВД · Сержант» */
function Where({ player }: { player: PlayerRecord }) {
  const parts = [serverName(player.server), player.organization && player.organization !== 'none' ? factionName(player.server, player.organization) : 'Без организации', player.position];
  return <div className="adm__meta">{parts.filter(Boolean).join(' · ')}</div>;
}

/**
 * The admin's part of the settings (ticket 15), seen by the author only — the server refuses anyone else:
 * the players' requests to be a leader, and any player found by name, made the leader of their faction or not.
 */
export function AdminSection() {
  const { api } = useRoles();
  const [requests, setRequests] = useState<(LeaderRequest & { player: PlayerRecord })[] | null>(null);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<PlayerRecord[] | null>(null);
  const [failed, setFailed] = useState(false);

  const loadRequests = useCallback(async () => {
    try {
      setRequests(await api.admin.requests());
    } catch {
      setFailed(true);
    }
  }, [api]);
  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const search = useCallback(
    async (words: string) => {
      if (!words.trim()) return setFound(null);
      try {
        setFound(await api.admin.search(words));
      } catch {
        setFailed(true);
      }
    },
    [api],
  );
  /** Does it, then shows what it changed — or that the server could not be reached. */
  const act = async (change: () => Promise<void>) => {
    try {
      await change();
      setFailed(false);
    } catch {
      setFailed(true);
    }
    await loadRequests();
    if (found) await search(query);
  };

  return (
    <>
      {failed && (
        <p className="login__error" role="alert">
          Нет связи с сервером — попробуйте ещё раз.
        </p>
      )}
      <h4 className="set__sub">Заявки лидеров</h4>
      {requests && requests.length === 0 && <p className="set__hint">Новых заявок нет</p>}
      {requests && requests.length > 0 && (
        <ul className="adm__list" aria-label="Заявки лидеров">
          {requests.map((request) => (
            <li key={request.id} className="adm__item">
              <div className="adm__text">
                <Who player={request.player} />
                <div className="adm__meta">{roleLabel(request)}</div>
                {request.note && <div className="adm__note">«{request.note}»</div>}
              </div>
              <span className="adm__actions">
                <button className="settings__button" type="button" onClick={() => void act(() => api.admin.decide(request.id, true))}>
                  Одобрить
                </button>
                <button className="link-btn" type="button" onClick={() => void act(() => api.admin.decide(request.id, false))}>
                  Отклонить
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <h4 className="set__sub">Игроки</h4>
      <form
        className="set__row"
        role="search"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void search(query);
        }}
      >
        <input
          className="presets__input"
          type="search"
          aria-label="Найти игрока"
          placeholder="Ник в Discord, Telegram или в игре"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="settings__button" type="submit">
          Найти
        </button>
      </form>
      {found && found.length === 0 && <p className="set__hint">Никого не нашлось. Игрок появится здесь, когда войдёт в аккаунт.</p>}
      {found && found.length > 0 && (
        <ul className="adm__list" aria-label="Игроки">
          {found.map((player) => {
            const place = player.server && player.organization && player.organization !== 'none' ? { server: player.server, organization: player.organization } : null;
            const leadsThere = place && player.roles.some((r) => r.server === place.server && r.organization === place.organization && r.role === 'leader');
            return (
              <li key={player.userId} className="adm__item">
                <div className="adm__text">
                  <Who player={player} />
                  <Where player={player} />
                  {player.roles.map((role) => (
                    <div key={`${role.server}/${role.organization}`} className="adm__role">
                      <span className="role">{roleLabel(role)}</span>
                      <button
                        className="link-btn"
                        type="button"
                        aria-label={`Снять: ${roleLabel(role)}`}
                        onClick={() => void act(() => api.admin.revoke(player.userId, role.server, role.organization))}
                      >
                        Снять
                      </button>
                    </div>
                  ))}
                </div>
                {place && !leadsThere && (
                  <span className="adm__actions">
                    <button className="settings__button" type="button" onClick={() => void act(() => api.admin.grant(player.userId, { ...place, role: 'leader' }))}>
                      Сделать лидером {roleLabel(place).replace(/^Лидер /, '')}
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
