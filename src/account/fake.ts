import type { LeaderRequest, Memo, PlayerRecord, PublicCard, Role, RolesApi } from './roles';
import type { RemoteSetting } from './sync';
import { SignInError, type Account, type Accounts, type UsageCount } from './types';

export interface FakeAccounts extends Accounts {
  /** The sign-in or the joining under way ends: signed in as this player, or failed for this reason. */
  finishSignIn(result: Account | SignInError['reason']): void;
  /** «signIn:discord», «linkTelegram», «signOut»… in order. */
  readonly calls: string[];
  /** The account's settings, by key. */
  readonly table: Map<string, RemoteSetting>;
  /** The anonymous counts sent, call by call. */
  readonly usage: UsageCount[][];
  /** The server's roles, as its tables hold them: the players' cards, their roles, the leader requests. */
  readonly server: {
    admins: Set<string>;
    cards: Map<string, PublicCard>;
    roles: Map<string, Role[]>;
    requests: (LeaderRequest & { userId: string })[];
    memos: Memo[];
  };
}

/** Accounts in memory, for tests: a sign-in waits until `finishSignIn`. */
export function createFakeAccounts(signedIn: Account | null = null): FakeAccounts {
  let account = signedIn;
  let waiting: { resolve: (account: Account) => void; reject: (error: SignInError) => void } | null = null;
  const calls: string[] = [];
  const table = new Map<string, RemoteSetting>();
  const usage: UsageCount[][] = [];
  const server: FakeAccounts['server'] = { admins: new Set(), cards: new Map(), roles: new Map(), requests: [], memos: [] };
  const me = () => {
    if (!account) throw new Error('signed out');
    return account.id;
  };
  const admin = () => {
    if (!server.admins.has(me())) throw new Error('not an admin');
  };
  const record = (userId: string): PlayerRecord => ({ userId, name: '', ...server.cards.get(userId), roles: [...(server.roles.get(userId) ?? [])] });
  const give = (userId: string, role: Role) =>
    server.roles.set(userId, [...(server.roles.get(userId) ?? []).filter((r) => r.server !== role.server || r.organization !== role.organization), role]);
  /** As the database's rules say: the leader of a faction, anyone with a role in it, one of its players by their card. */
  const leads = (at: string, organization: string) => (server.roles.get(me()) ?? []).some((r) => r.server === at && r.organization === organization && r.role === 'leader');
  const writes = (at: string, organization: string) => (server.roles.get(me()) ?? []).some((r) => r.server === at && r.organization === organization);
  const member = (at: string, organization: string) => {
    const card = server.cards.get(me());
    return card?.server === at && card.organization === organization;
  };
  let memoId = 0;
  const roles: RolesApi = {
    faction: {
      members: async (at, organization) => {
        if (!leads(at, organization)) return [];
        return [...server.cards.entries()].filter(([, card]) => card.server === at && card.organization === organization).map(([userId]) => record(userId));
      },
      setDeputy: async (userId, deputy) => {
        const card = server.cards.get(userId);
        if (!card?.server || !card.organization || !leads(card.server, card.organization)) throw new Error("not the leader of this player's faction");
        const place = { server: card.server, organization: card.organization };
        const own = server.roles.get(userId) ?? [];
        const there = own.find((r) => r.server === place.server && r.organization === place.organization);
        if (deputy && !there) give(userId, { ...place, role: 'deputy' });
        if (!deputy && there?.role === 'deputy') server.roles.set(userId, own.filter((r) => r !== there));
      },
    },
    memos: {
      list: async (at, organization) =>
        member(at, organization) || writes(at, organization)
          ? server.memos.filter((m) => m.server === at && m.organization === organization).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          : [],
      post: async (memo) => {
        if (!writes(memo.server, memo.organization)) throw new Error('not allowed');
        server.memos.push({ ...memo, id: ++memoId, authorId: me(), createdAt: new Date().toISOString() });
      },
      remove: async (id) => {
        const memo = server.memos.find((m) => m.id === id);
        if (!memo || (memo.authorId !== me() && !leads(memo.server, memo.organization))) throw new Error('not allowed');
        server.memos = server.memos.filter((m) => m !== memo);
      },
    },
    publish: async (card) => {
      server.cards.set(me(), card);
    },
    mine: async () => {
      const id = me();
      const own = server.requests.filter((r) => r.userId === id);
      const latest = own[own.length - 1];
      return { roles: [...(server.roles.get(id) ?? [])], admin: server.admins.has(id), request: latest ? { ...latest } : null };
    },
    requestLeader: async (at, organization, note) => {
      const id = me();
      if (server.requests.some((r) => r.userId === id && r.status === 'pending')) throw new Error('one request at a time');
      server.requests.push({ id: server.requests.length + 1, userId: id, server: at, organization, status: 'pending', createdAt: new Date().toISOString(), ...(note.trim() ? { note: note.trim() } : {}) });
    },
    admin: {
      requests: async () => {
        admin();
        return server.requests.filter((r) => r.status === 'pending').map((r) => ({ ...r, player: record(r.userId) }));
      },
      decide: async (id, approve) => {
        admin();
        const request = server.requests.find((r) => r.id === id && r.status === 'pending');
        if (!request) return;
        request.status = approve ? 'approved' : 'rejected';
        if (approve) give(request.userId, { server: request.server, organization: request.organization, role: 'leader' });
      },
      search: async (query) => {
        admin();
        const words = query.trim().toLowerCase();
        return [...server.cards.entries()]
          .filter(([, card]) => card.name.toLowerCase().includes(words) || card.gameName?.toLowerCase().includes(words))
          .map(([userId]) => record(userId));
      },
      grant: async (userId, role) => {
        admin();
        give(userId, role);
      },
      revoke: async (userId, at, organization) => {
        admin();
        server.roles.set(userId, (server.roles.get(userId) ?? []).filter((r) => r.server !== at || r.organization !== organization));
      },
    },
  };
  const wait = () =>
    new Promise<Account>((resolve, reject) => {
      waiting = { resolve, reject };
    });
  return {
    calls,
    table,
    usage,
    server,
    roles,
    sendUsage: async (counts) => {
      usage.push(counts);
    },
    settings: {
      pull: async (since) => [...table.values()].filter((row) => !since || row.updated_at > since),
      push: async (rows) => {
        for (const row of rows) if (!table.has(row.key) || table.get(row.key)!.updated_at <= row.updated_at) table.set(row.key, row);
      },
    },
    current: async () => account,
    aiToken: async () => (account ? `token-of-${account.id}` : null),
    signIn(provider) {
      calls.push(`signIn:${provider}`);
      return wait();
    },
    linkTelegram() {
      calls.push('linkTelegram');
      return wait();
    },
    cancelSignIn() {
      calls.push('cancelSignIn');
      waiting?.reject(new SignInError('cancelled'));
      waiting = null;
    },
    async signOut() {
      calls.push('signOut');
      account = null;
    },
    finishSignIn(result) {
      if (typeof result === 'string') waiting?.reject(new SignInError(result));
      else {
        account = result;
        waiting?.resolve(result);
      }
      waiting = null;
    },
  };
}
