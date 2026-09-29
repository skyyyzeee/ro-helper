import { createContext, Fragment, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { PlatformProvider, usePlatform } from '../platform/PlatformContext';
import type { PlatformAdapter } from '../platform/types';
import { useAccount } from './AccountContext';
import { createSync, type SyncRules, type SyncStatus } from './sync';
import type { Accounts } from './types';
import { sendUsage } from './usage';

const SyncContext = createContext<SyncStatus>({ kind: 'off' });

/**
 * Syncs the settings with the account while the player is signed in: the first time on this computer it joins
 * them, then every setting the app saves is sent, and the account's are taken whenever the helper is opened.
 * When some came from another computer, everything under it starts again and reads them.
 */
export function SyncProvider({ accounts, rules, children }: { accounts: Accounts; rules: SyncRules; children: ReactNode }) {
  const base = usePlatform();
  const { status: account } = useAccount();
  const [stamp, setStamp] = useState(0);
  const engine = useMemo(
    () => createSync(base, accounts.settings, rules, { onRemote: () => setStamp((n) => n + 1) }),
    [base, accounts, rules],
  );
  const [status, setStatus] = useState<SyncStatus>(engine.status());
  useEffect(() => engine.onStatus(setStatus), [engine]);

  const user = account.kind === 'signed-in' ? account.account.id : null;
  const signedOut = account.kind === 'signed-out';
  useEffect(() => {
    if (user) void engine.start(user);
    else if (signedOut) engine.stop();
  }, [engine, user, signedOut]);
  useEffect(() => base.onOverlayShown(() => void engine.sync()), [base, engine]);
  // The author's anonymous counts: at start and when the helper is opened, at most once an hour.
  useEffect(() => {
    const send = () => void sendUsage(base, (counts) => accounts.sendUsage(counts)).catch(() => undefined);
    send();
    return base.onOverlayShown(send);
  }, [base, accounts]);

  // What the app saves goes to the account too; everything else is the platform's own, looked up as it is called.
  const platform = useMemo<PlatformAdapter>(() => {
    const writeSetting: PlatformAdapter['writeSetting'] = async (key, value) => {
      await base.writeSetting(key, value);
      void engine.record(key, value);
    };
    return new Proxy(base, { get: (target, name, receiver) => (name === 'writeSetting' ? writeSetting : Reflect.get(target, name, receiver)) });
  }, [base, engine]);

  return (
    <SyncContext.Provider value={status}>
      <PlatformProvider platform={platform}>
        <Fragment key={stamp}>{children}</Fragment>
      </PlatformProvider>
    </SyncContext.Provider>
  );
}

/** Where the settings are with the account: off, being synced, synced at, or waiting for the connection. */
export const useSyncStatus = () => useContext(SyncContext);
