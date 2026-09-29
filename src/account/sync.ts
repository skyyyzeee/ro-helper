import type { PlatformAdapter } from '../platform/types';

/** A setting as the account keeps it: its value and when it was last changed (ISO). */
export interface RemoteSetting {
  key: string;
  value: unknown;
  updated_at: string;
}

/** Where the account's settings live (Supabase's table user_settings, behind its rules). */
export interface SyncBackend {
  /** The account's settings changed after `since`, or all of them. Throws when offline. */
  pull(since?: string): Promise<RemoteSetting[]>;
  /** Saves these; an older change never overwrites a newer one. Throws when offline. */
  push(settings: RemoteSetting[]): Promise<void>;
}

/** Which settings follow the player between computers, and how. */
export interface SyncRules {
  /** Every synced key this computer may have (the ones per server included), for the first sign-in. */
  keys(): string[];
  isSynced(key: string): boolean;
  /** What of a local value goes to the account (the profile without its hotkey). */
  toRemote(key: string, local: unknown): unknown;
  /** The account's value as this computer keeps it (the profile with this computer's hotkey). */
  fromRemote(key: string, remote: unknown, local: unknown): unknown;
  /** The first sign-in on a computer that has its own: one value for both (lists joined, the rest the account's). */
  merge(key: string, remote: unknown, local: unknown): unknown;
}

export type SyncStatus = { kind: 'off' } | { kind: 'syncing' } | { kind: 'synced'; at: string } | { kind: 'offline'; at?: string };

/** Changes not yet in the account, by key: kept in the settings, so they reach it after a restart too. */
const PENDING_KEY = 'sync.pending';
/** The newest change pulled from the account. */
const PULLED_KEY = 'sync.pulled';
/** The account this computer's settings were joined with at its first sign-in here. */
const JOINED_KEY = 'sync.user';

export interface SyncEngine {
  /** Syncs with this account from now on; the first time on this computer, joins what is here with it. */
  start(userId: string): Promise<void>;
  stop(): void;
  /** A setting just saved on this computer; resolves once it waits to be sent. */
  record(key: string, value: unknown): Promise<void>;
  /** Sends what is waiting and takes what changed elsewhere. */
  sync(): Promise<void>;
  status(): SyncStatus;
  onStatus(listener: (status: SyncStatus) => void): () => void;
}

export interface SyncOptions {
  /** Called when settings came from the account: the UI reads them again. */
  onRemote: () => void;
  /** How long after a change it is sent. */
  pushDelayMs?: number;
  now?: () => Date;
}

/**
 * Keeps the synced settings of this computer and of the account the same. Local changes are sent a moment
 * after they are made and wait in the settings while offline; the account's are taken on each sync. When both
 * changed, the later change wins.
 */
export function createSync(platform: Pick<PlatformAdapter, 'readSetting' | 'writeSetting'>, backend: SyncBackend, rules: SyncRules, options: SyncOptions): SyncEngine {
  const now = options.now ?? (() => new Date());
  const pushDelayMs = options.pushDelayMs ?? 1500;
  let user: string | null = null;
  let state: SyncStatus = { kind: 'off' };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | null = null;
  const listeners = new Set<(status: SyncStatus) => void>();

  const setStatus = (next: SyncStatus) => {
    state = next;
    for (const listener of listeners) listener(next);
  };
  const pending = async () => (await platform.readSetting<Record<string, RemoteSetting>>(PENDING_KEY)) ?? {};
  /** The changes waiting to be sent are changed one at a time: a new one never lost to one just sent. */
  let lock: Promise<unknown> = Promise.resolve();
  const changePending = (change: (waiting: Record<string, RemoteSetting>) => void) => {
    const next = lock.then(async () => {
      const waiting = await pending();
      change(waiting);
      await platform.writeSetting(PENDING_KEY, waiting);
    });
    lock = next.catch(() => undefined);
    return next;
  };

  /** Takes the account's settings in: those changed here later stay as they are, to be sent. */
  const take = async (rows: RemoteSetting[]) => {
    const waiting = await pending();
    let changed = false;
    let newest = (await platform.readSetting<string>(PULLED_KEY)) ?? '';
    for (const row of rows) {
      if (row.updated_at > newest) newest = row.updated_at;
      const mine = waiting[row.key];
      if (mine && mine.updated_at >= row.updated_at) continue;
      const local = await platform.readSetting(row.key);
      const value = rules.fromRemote(row.key, row.value, local);
      if (JSON.stringify(value) === JSON.stringify(local)) continue;
      await platform.writeSetting(row.key, value);
      changed = true;
    }
    if (newest) await platform.writeSetting(PULLED_KEY, newest);
    return changed;
  };

  const run = async () => {
    if (!user) return;
    const me = user;
    setStatus({ kind: 'syncing' });
    try {
      const waiting = await pending();
      const sent = Object.values(waiting);
      if (sent.length) {
        await backend.push(sent);
        // What changed again while it was being sent stays for the next time.
        await changePending((after) => {
          for (const row of sent) if (after[row.key]?.updated_at === row.updated_at) delete after[row.key];
        });
      }
      const since = await platform.readSetting<string>(PULLED_KEY);
      const changed = await take(await backend.pull(since || undefined));
      if (user !== me) return;
      setStatus({ kind: 'synced', at: now().toISOString() });
      if (changed) options.onRemote();
    } catch {
      if (user !== me) return;
      setStatus({ kind: 'offline', at: state.kind === 'synced' || state.kind === 'offline' ? state.at : undefined });
    }
  };

  const sync = async () => {
    // One at a time; a call during one waits for it and runs again.
    while (running) await running;
    running = run().finally(() => {
      running = null;
    });
    return running;
  };

  /** The first sign-in on this computer: what is here joins the account's. */
  const join = async (userId: string) => {
    const remote = new Map((await backend.pull()).map((row) => [row.key, row]));
    const at = now().toISOString();
    const upload: Record<string, RemoteSetting> = {};
    let changed = false;
    for (const key of rules.keys()) {
      const local = await platform.readSetting(key);
      const theirs = remote.get(key);
      if (local === undefined || local === null) continue;
      if (!theirs) {
        upload[key] = { key, value: rules.toRemote(key, local), updated_at: at };
        continue;
      }
      const joined = rules.merge(key, theirs.value, local);
      const kept = rules.fromRemote(key, joined, local);
      if (JSON.stringify(kept) !== JSON.stringify(local)) {
        await platform.writeSetting(key, kept);
        changed = true;
      }
      if (JSON.stringify(rules.toRemote(key, kept)) !== JSON.stringify(theirs.value)) upload[key] = { key, value: rules.toRemote(key, kept), updated_at: at };
    }
    // Keys only the account has come in with the first pull.
    await changePending((waiting) => {
      for (const key of Object.keys(waiting)) delete waiting[key];
      Object.assign(waiting, upload);
    });
    await platform.writeSetting(PULLED_KEY, '');
    await platform.writeSetting(JOINED_KEY, userId);
    return changed;
  };

  return {
    async start(userId) {
      if (user === userId) return;
      user = userId;
      setStatus({ kind: 'syncing' });
      try {
        if ((await platform.readSetting<string>(JOINED_KEY)) !== userId) {
          const changed = await join(userId);
          if (changed) options.onRemote();
        }
      } catch {
        // Offline at the first sign-in: joined at the next start.
        setStatus({ kind: 'offline' });
        user = null;
        return;
      }
      await sync();
    },

    stop() {
      user = null;
      clearTimeout(timer);
      setStatus({ kind: 'off' });
    },

    async record(key, value) {
      if (!user || !rules.isSynced(key)) return;
      const updated_at = now().toISOString();
      await changePending((waiting) => {
        waiting[key] = { key, value: rules.toRemote(key, value), updated_at };
      }).then(() => {
        clearTimeout(timer);
        timer = setTimeout(() => void sync(), pushDelayMs);
      });
    },

    sync,
    status: () => state,
    onStatus(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
