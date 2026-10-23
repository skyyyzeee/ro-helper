import { useCallback, useEffect, useState } from 'react';
import { useAccount } from '../account/AccountContext';
import type { PlayerRecord } from '../account/roles';
import { factionName } from './AdminView';
import { MEMOS } from './features';
import { useMemos } from './memos';
import { useRoles } from './roles';

/**
 * The leader's part of the account (ticket 16), as in the mockup's «Лидер фракции»: the faction's memos, and
 * its deputies — any player of the faction made one, or not.
 */
export function FactionPanel({ server, organization, onMemos }: { server: string; organization: string; onMemos: () => void }) {
  const { api } = useRoles();
  const { active } = useMemos();
  const { status } = useAccount();
  const me = status.kind === 'signed-in' ? status.account.id : null;
  const [members, setMembers] = useState<PlayerRecord[] | null>(null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      setMembers(await api.faction.members(server, organization));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [api, server, organization]);
  useEffect(() => {
    void load();
  }, [load]);

  const roleHere = (player: PlayerRecord) => player.roles.find((r) => r.server === server && r.organization === organization)?.role;
  const deputies = (members ?? []).filter((player) => roleHere(player) === 'deputy');
  const words = filter.trim().toLowerCase();
  const shown = (members ?? [])
    .filter((player) => player.userId !== me)
    .filter((player) => !words || player.name.toLowerCase().includes(words) || player.gameName?.toLowerCase().includes(words));

  return (
    <div className="faction" role="group" aria-label="Лидер фракции">
      <h4 className="set__sub">Лидер фракции · {factionName(server, organization)}</h4>
      <div className="tiles">
        {/* Memos are off for now (features.ts); the deputies stay — they ask the AI as leaders do. */}
        {MEMOS && (
          <button className="tile" type="button" onClick={onMemos}>
            <span className="t">Памятки фракции</span>
            <span className="s">
              {active.length} действующих{members ? ` · игроков во фракции: ${members.length}` : ''}
            </span>
          </button>
        )}
        <button className="tile" type="button" aria-expanded={open} onClick={() => setOpen((now) => !now)}>
          <span className="t">Заместители</span>
          <span className="s">{deputies.length ? `${deputies.length} назначено` : 'не назначены'}</span>
        </button>
      </div>
      {failed && (
        <p className="login__error" role="alert">
          Нет связи с сервером — попробуйте ещё раз.
        </p>
      )}
      {open && (
        <>
          <p className="set__hint">Заместители тоже пишут памятки фракции. Здесь игроки, которые вошли в аккаунт и выбрали вашу фракцию.</p>
          <input
            className="presets__input"
            type="search"
            aria-label="Найти во фракции"
            placeholder="Ник в Discord, Telegram или в игре"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {shown.length === 0 ? (
            <p className="set__hint">Пока никого.</p>
          ) : (
            <ul className="adm__list" aria-label="Игроки фракции">
              {shown.map((player) => {
                const role = roleHere(player);
                return (
                  <li key={player.userId} className="adm__item">
                    <div className="adm__text">
                      <div className="adm__who">
                        <b>{player.name || 'Без имени'}</b>
                        {player.gameName && ` · ${player.gameName}`}
                      </div>
                      {player.position && <div className="adm__meta">{player.position}</div>}
                      {role && <span className="role">{role === 'leader' ? 'Лидер' : 'Заместитель'}</span>}
                    </div>
                    {role !== 'leader' && (
                      <span className="adm__actions">
                        <button
                          className={role === 'deputy' ? 'link-btn' : 'settings__button'}
                          type="button"
                          onClick={() =>
                            void api.faction
                              .setDeputy(player.userId, role !== 'deputy')
                              .then(load)
                              .catch(() => setFailed(true))
                          }
                        >
                          {role === 'deputy' ? 'Снять заместителя' : 'Сделать заместителем'}
                        </button>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
