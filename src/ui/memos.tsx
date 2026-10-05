import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAccount } from '../account/AccountContext';
import { capabilitiesOf, isFaction } from '../account/capabilities';
import type { Memo } from '../account/roles';
import { usePlatform } from '../platform/PlatformContext';
import { packFor } from '../data';
import { factionName } from './AdminView';
import { PROFILE_KEY, type Profile } from './profile';
import { memoPlain } from './memoText';
import { useRoles } from './roles';

/** The memos already told over the game, by id: a memo is told once. */
const SEEN_KEY = 'memos.seen';
/** How often the memos are asked for while the assistant runs, to tell a new one over the game. */
const EVERY_MS = 10 * 60 * 1000;

/** How long a memo runs: its writer picks. */
export const MEMO_DURATIONS: { days: number; label: string }[] = [
  { days: 1, label: 'День' },
  { days: 3, label: '3 дня' },
  { days: 7, label: 'Неделя' },
  { days: 30, label: 'Месяц' },
];

export interface MemosControl {
  /** The faction the memos are of: the player's server and organisation; null without one, or signed out. */
  place: { server: string; organization: string } | null;
  active: Memo[];
  archive: Memo[];
  /** The leader and the deputies write. */
  canWrite: boolean;
  /** The leader removes any; a deputy their own. */
  canRemove: (memo: Memo) => boolean;
  post(text: string, days: number): Promise<void>;
  remove(id: number): Promise<void>;
  refresh(): Promise<void>;
}

const MemosContext = createContext<MemosControl | null>(null);

/**
 * The memos of the player's faction (ticket 17): asked for at sign-in, whenever the assistant opens and every
 * ten minutes; a new one is told once, over the game. Signed out or without a faction there are none.
 */
export function MemosProvider({ children }: { children: ReactNode }) {
  const platform = usePlatform();
  const { status } = useAccount();
  const { api, mine } = useRoles();
  const account = status.kind === 'signed-in' ? status.account : null;
  const [place, setPlace] = useState<MemosControl['place']>(null);
  const [memos, setMemos] = useState<Memo[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const placeRef = useRef(place);
  placeRef.current = place;

  const refresh = useCallback(async () => {
    if (!account) {
      setPlace(null);
      setMemos([]);
      return;
    }
    const profile = await platform.readSetting<Profile>(PROFILE_KEY);
    const organization = profile && packFor(profile.server).organizations.find((o) => o.id === profile.organization);
    const here = profile && isFaction(organization) ? { server: profile.server, organization: organization.id } : null;
    setPlace(here);
    setNow(Date.now());
    if (!here) return setMemos([]);
    let list: Memo[];
    try {
      list = await api.memos.list(here.server, here.organization);
    } catch {
      return; // Offline: what was known stays.
    }
    setMemos(list);
    // A memo not told before is told over the game — not the ones there were before the first look.
    const seen = await platform.readSetting<number[]>(SEEN_KEY);
    const running = list.filter((memo) => Date.parse(memo.until) > Date.now());
    const fresh = seen ? running.filter((memo) => !seen.includes(memo.id) && memo.authorId !== account.id) : [];
    if (fresh.length) {
      const newest = fresh[0];
      const plain = memoPlain(newest.text);
      void platform.showToast({
        id: `memo-${newest.id}`,
        title: `Памятка лидера ${factionName(newest.server, newest.organization)}`,
        text: plain.length > 160 ? `${plain.slice(0, 157)}…` : plain,
      });
    }
    await platform.writeSetting(SEEN_KEY, [...new Set([...(seen ?? []), ...running.map((memo) => memo.id)])].slice(-200));
  }, [account, api, platform]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), EVERY_MS);
    const stop = platform.onOverlayShown(() => void refresh());
    return () => {
      clearInterval(timer);
      stop();
    };
  }, [platform, refresh]);

  // What the player may do with the memos of their faction.
  const can = capabilitiesOf({
    signedIn: !!account,
    roles: mine?.roles ?? [],
    admin: !!mine?.admin,
    server: place?.server ?? '',
    organization: place ? packFor(place.server).organizations.find((o) => o.id === place.organization) : undefined,
  });
  const control: MemosControl = {
    place,
    active: memos.filter((memo) => Date.parse(memo.until) > now),
    archive: memos.filter((memo) => Date.parse(memo.until) <= now),
    canWrite: can.has('memos.write'),
    canRemove: (memo) => can.has('memos.moderate') || memo.authorId === account?.id,
    async post(text, days) {
      const here = placeRef.current;
      if (!here || !account) return;
      await api.memos.post({ ...here, authorName: account.name, text, until: new Date(Date.now() + days * 24 * 3600 * 1000).toISOString() });
      await refresh();
    },
    async remove(id) {
      await api.memos.remove(id);
      await refresh();
    },
    refresh,
  };
  return <MemosContext.Provider value={control}>{children}</MemosContext.Provider>;
}

export function useMemos(): MemosControl {
  const control = useContext(MemosContext);
  if (!control) throw new Error('useMemos must be used inside <MemosProvider>');
  return control;
}
