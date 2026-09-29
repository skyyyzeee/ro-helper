import { useEffect, useMemo, useState } from 'react';
import { usePlatform } from '../platform/PlatformContext';
import { GAME_NAME_MAX, POSITION_MAX, usePlayerCard } from './player';
import type { Organization, ServerPack } from '../core';
import { EMPTY_STATS, topArticles, totalStats, type Stats } from './stats';
import { useAccount } from '../account/AccountContext';
import { useSyncStatus } from '../account/SyncContext';
import type { SyncStatus } from '../account/sync';
import type { Account, Provider } from '../account/types';

const PROVIDER_NAME: Record<Provider, string> = { discord: 'Discord', telegram: 'Telegram' };
import { DiscordIcon, ProfileIcon, ServerIcon, TelegramIcon } from './icons';

/**
 * The player's Discord avatar; without one, or when it can't be loaded (offline), their initials on a
 * gradient, as in the mockup.
 */
export function Avatar({ account, size, label }: { account: Account; size: number; label?: string }) {
  const [broken, setBroken] = useState(false);
  if (!account.avatar || broken) {
    const initials = account.name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase() || '?';
    return (
      <span className="avatar avatar--initials" role={label ? 'img' : undefined} aria-label={label} style={{ width: size, height: size, fontSize: size * 0.36 }}>
        {initials}
      </span>
    );
  }
  return (
    <img
      className="avatar"
      src={account.avatar}
      alt={label ?? ''}
      width={size}
      height={size}
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
    />
  );
}

/** The top of the settings' column: who is signed in, or that nobody is. Leads to the account block. */
export function AccountCard({ current, onSelect }: { current: boolean; onSelect: () => void }) {
  const { status } = useAccount();
  const account = status.kind === 'signed-in' ? status.account : null;
  return (
    <button className="setnav__account" type="button" aria-current={current ? 'true' : undefined} onClick={onSelect}>
      {account ? <Avatar account={account} size={36} /> : <span className="setnav__nobody"><ProfileIcon size={22} /></span>}
      <span className="setnav__who">
        <span className="setnav__name">{account ? account.name : 'Аккаунт'}</span>
        <span className="setnav__via">{account ? PROVIDER_NAME[account.via ?? 'discord'] : 'Вход не выполнен'}</span>
      </span>
    </button>
  );
}

/** «2 мин назад» */
function ago(iso: string, now = Date.now()): string {
  const minutes = Math.floor((now - Date.parse(iso)) / 60000);
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} ч назад` : new Date(iso).toLocaleDateString('ru-RU');
}

/** As in the mockup: a dot and where the settings are with the account. */
function SyncLine({ status }: { status: SyncStatus }) {
  if (status.kind === 'off') return null;
  const text =
    status.kind === 'syncing'
      ? 'Синхронизирую…'
      : status.kind === 'synced'
        ? `Настройки, избранное и наборы закреплённого синхронизированы · ${ago(status.at)}`
        : 'Нет связи — изменения отправятся, когда появится интернет';
  return (
    <div className={`syncline syncline--${status.kind}`} role="status" aria-label="Синхронизация">
      <i />
      {text}
    </div>
  );
}

/** A line of the card the player fills in: kept when they leave the field or press Enter. */
function CardField({ label, value, placeholder, max, onSave }: { label: string; value: string; placeholder: string; max: number; onSave: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const save = () => {
    if (draft.trim() !== value) onSave(draft);
  };
  return (
    <label className="set__row">
      <span className="set__label pcard__field">{label}</span>
      <input
        className="presets__input"
        type="text"
        aria-label={label}
        placeholder={placeholder}
        maxLength={max}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            save();
          }
        }}
      />
    </label>
  );
}

/** «статья», «статьи», «статей» for a count. */
function wordFor(n: number, [one, few, many]: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/**
 * The player's own counts, as in the mockup: three numbers, and the articles they use most as bars. Seen by
 * them only; summed over their computers.
 */
function StatsBlock({ pack }: { pack: ServerPack }) {
  const platform = usePlatform();
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  useEffect(() => {
    let active = true;
    void totalStats(platform).then((total) => {
      if (active) setStats(total);
    });
    return () => {
      active = false;
    };
  }, [platform]);
  // «УК ст. 65 ч. 1» for an article's key; articles of other servers are left out.
  const names = useMemo(() => {
    const byId = new Map<string, string>();
    for (const document of pack.documents) for (const article of document.articles) byId.set(article.id, `${document.short} ст. ${article.number}`);
    return byId;
  }, [pack]);
  const top = topArticles(stats, 50)
    .map(([key, n]) => {
      const [id, part] = key.split('#');
      const name = names.get(id);
      return name ? { key, n, name: part ? `${name} ч. ${part}` : name } : null;
    })
    .filter((row) => row !== null)
    .slice(0, 4);
  const most = top[0]?.n ?? 1;
  const figures: [number, [string, string, string]][] = [
    [stats.opened, ['открыта статья', 'открыто статьи', 'открыто статей']],
    [stats.searches, ['поиск', 'поиска', 'поисков']],
    [stats.calculations, ['расчёт наказания', 'расчёта наказания', 'расчётов наказания']],
  ];
  return (
    <div className="pstats" role="group" aria-label="Статистика">
      <div className="stats">
        {figures.map(([n, forms]) => (
          <div key={forms[2]} className="stat">
            <b>{n.toLocaleString('ru-RU')}</b>
            <span>{wordFor(n, forms)}</span>
          </div>
        ))}
      </div>
      {top.length > 0 && (
        <>
          <h4 className="set__sub">Чаще всего · {pack.server.name}</h4>
          <div className="bars" role="list" aria-label="Чаще всего">
            {top.map((row) => (
              <div key={row.key} className="barrow" role="listitem" title={`${row.name}: ${row.n}`}>
                <span className="bn">{row.name}</span>
                <span className="bt">
                  <i style={{ width: `${Math.max(6, (row.n / most) * 100)}%` }} />
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const FAILED = {
  failed: 'Не удалось войти. Проверьте интернет и попробуйте ещё раз.',
  unsupported: 'Вход работает только в самом ассистенте, не в браузере.',
  expired: 'Время на вход вышло — нажмите ещё раз.',
  taken: 'Этот Telegram уже привязан к другому аккаунту.',
};
const WAITING: Record<Provider, string> = {
  discord: 'Подтвердите вход в браузере — он открылся в Discord.',
  telegram: 'Нажмите «Запустить» у бота в Telegram — он открылся сам.',
};

/**
 * The account, first in the settings. Signed in: the player's card of the mockup (avatar, name,
 * server · faction, how they signed in), joining Telegram to a Discord account, and signing out. Signed
 * out: signing in with Discord or Telegram, optional for now.
 */
export function AccountSection({ pack, organization }: { pack: ServerPack; organization?: Organization }) {
  const { server } = pack;
  const { status, signIn, linkTelegram, cancelSignIn, signOut } = useAccount();
  const sync = useSyncStatus();
  const [card, saveCard] = usePlayerCard(usePlatform());
  const faction = organization && organization.id !== 'none' ? organization.name : 'Без организации';

  if (status.kind === 'signed-in') {
    const { account } = status;
    return (
      <>
        <div className="pcard">
          <Avatar account={account} size={52} label={`Аватар ${account.name}`} />
          <div className="pcard__who">
            <div className="pcard__name">{account.name}</div>
            <div className="pcard__meta">
              <ServerIcon id={server.id} size={14} />
              {server.name} · {faction}
              {card.position && ` · ${card.position}`}
            </div>
            {card.gameName && <div className="pcard__meta">В игре: {card.gameName}</div>}
          </div>
          <span className="sp" />
          <span className="pcard__via" title={`Вход через ${PROVIDER_NAME[account.via ?? 'discord']}`}>
            {account.via === 'telegram' ? <TelegramIcon size={18} /> : <DiscordIcon size={18} />}
          </span>
        </div>
        <StatsBlock pack={pack} />
        <CardField label="Игровой ник" value={card.gameName ?? ''} placeholder="Например, Ivan_Petrov — по желанию" max={GAME_NAME_MAX} onSave={(gameName) => saveCard({ ...card, gameName })} />
        <CardField label="Должность" value={card.position ?? ''} placeholder="Например, сержант ППС — по желанию" max={POSITION_MAX} onSave={(position) => saveCard({ ...card, position })} />
        {/* Telegram joins a Discord account, so either signs in to it. */}
        {account.via !== 'telegram' && (
          <div className="set__row">
            <TelegramIcon size={16} />
            {account.telegram ? (
              <span className="set__label">
                Telegram <b className="set__value">{account.telegram}</b> привязан — через него тоже можно войти
              </span>
            ) : status.linking ? (
              <>
                <span className="set__label">{WAITING.telegram}</span>
                <span className="sp" />
                <button className="settings__button" type="button" onClick={cancelSignIn}>
                  Отмена
                </button>
              </>
            ) : (
              <>
                <span className="set__label">Привяжите Telegram, чтобы входить и через него.</span>
                <span className="sp" />
                <button className="settings__button" type="button" onClick={linkTelegram}>
                  Привязать Telegram
                </button>
              </>
            )}
          </div>
        )}
        {status.error && (
          <p className="login__error" role="alert">
            {FAILED[status.error]}
          </p>
        )}
        <div className="set__row">
          <SyncLine status={sync} />
          <span className="sp" />
          <button className="settings__button" type="button" onClick={signOut}>
            Выйти
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="login">
      <p className="login__lead">Войдите, чтобы настройки, избранное и наборы закреплённого были с вами на любом компьютере.</p>
      {status.kind === 'signing-in' ? (
        <div className="login__wait">
          <span>{WAITING[status.provider]}</span>
          <button className="settings__button" type="button" onClick={cancelSignIn}>
            Отмена
          </button>
        </div>
      ) : (
        <>
          {status.kind === 'signed-out' && status.error && (
            <p className="login__error" role="alert">
              {FAILED[status.error]}
            </p>
          )}
          <button className="oauth oauth--discord" type="button" disabled={status.kind === 'loading'} onClick={() => signIn('discord')}>
            <DiscordIcon size={20} />
            Войти через Discord
          </button>
          <button className="oauth oauth--tg" type="button" disabled={status.kind === 'loading'} onClick={() => signIn('telegram')}>
            <TelegramIcon size={20} />
            Войти через Telegram
          </button>
        </>
      )}
      <small className="login__note">
        Вход по желанию: без него всё работает как раньше. Мы получим ник, аватар и почту из Discord или имя и ник из Telegram. После входа интернет не нужен.
      </small>
    </div>
  );
}
