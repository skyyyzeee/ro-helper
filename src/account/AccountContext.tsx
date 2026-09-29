import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { SignInError, type Account, type Accounts, type Provider } from './types';

type Failure = Exclude<SignInError['reason'], 'cancelled'>;

/** Where the player is with their account. */
export type AccountStatus =
  | { kind: 'loading' }
  | { kind: 'signed-out'; error?: Failure }
  | { kind: 'signing-in'; provider: Provider }
  /** `linking` while Telegram is being joined to the account; `error` when that failed. */
  | { kind: 'signed-in'; account: Account; linking?: boolean; error?: Failure };

export interface AccountControl {
  status: AccountStatus;
  signIn(provider: Provider): void;
  linkTelegram(): void;
  cancelSignIn(): void;
  signOut(): void;
}

const AccountContext = createContext<AccountControl | null>(null);

/** Why it failed, or nothing when the player gave it up. */
const failure = (error: unknown): Failure | undefined => {
  const reason = error instanceof SignInError ? error.reason : 'failed';
  return reason === 'cancelled' ? undefined : reason;
};

export function AccountProvider({ accounts, children }: { accounts: Accounts; children: ReactNode }) {
  const [status, setStatus] = useState<AccountStatus>({ kind: 'loading' });

  useEffect(() => {
    let active = true;
    void accounts.current().then((account) => {
      if (active) setStatus(account ? { kind: 'signed-in', account } : { kind: 'signed-out' });
    });
    return () => {
      active = false;
    };
  }, [accounts]);

  const signIn = useCallback(
    (provider: Provider) => {
      setStatus({ kind: 'signing-in', provider });
      accounts.signIn(provider).then(
        (account) => setStatus({ kind: 'signed-in', account }),
        (error: unknown) => setStatus({ kind: 'signed-out', error: failure(error) }),
      );
    },
    [accounts],
  );
  const linkTelegram = useCallback(() => {
    setStatus((now) => (now.kind === 'signed-in' ? { kind: 'signed-in', account: now.account, linking: true } : now));
    accounts.linkTelegram().then(
      (account) => setStatus({ kind: 'signed-in', account }),
      (error: unknown) =>
        setStatus((now) => (now.kind === 'signed-in' ? { kind: 'signed-in', account: now.account, error: failure(error) } : now)),
    );
  }, [accounts]);
  const cancelSignIn = useCallback(() => accounts.cancelSignIn(), [accounts]);
  const signOut = useCallback(() => {
    void accounts.signOut().then(() => setStatus({ kind: 'signed-out' }));
  }, [accounts]);

  const control = useMemo(
    () => ({ status, signIn, linkTelegram, cancelSignIn, signOut }),
    [status, signIn, linkTelegram, cancelSignIn, signOut],
  );
  return <AccountContext.Provider value={control}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountControl {
  const control = useContext(AccountContext);
  if (!control) throw new Error('useAccount must be used inside <AccountProvider>');
  return control;
}
