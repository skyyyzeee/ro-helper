// «Требования адвоката»: an officer tells what a lawyer demands, and gets each demand weighed against the server's
// laws — lawful or not, on what basis, what the officer must do or may refuse — and a reply to give. The AI is
// told to take no side: where the lawyer is right, it says so, and what the officer is bound to do. A verdict stands
// only on a source it names, that was given and is a law or a charter: otherwise it is shown as not found. The
// weighing itself is protocol/officerChecks.ts, which the exam asks too.
import { useCallback, useState } from 'react';
import type { ServerPack } from '../core';
import { checkDemands, type LawyerAnswer } from '../protocol/officerChecks';
import type { PlatformAdapter } from '../platform/types';
import { connect, serviceFor } from './ai';

export { spoken, type Demand, type LawyerAnswer, type Verdict } from '../protocol/officerChecks';

export interface LawyerCheck {
  busy: boolean;
  result: LawyerAnswer | null;
  error: string | null;
  check: (said: string) => Promise<void>;
  reset: () => void;
}

/** Said instead of checking, to a player whose profile has no checks of an officer's actions (capability ai.check). */
export const NO_CHECK = 'Проверка действий сотрудника — для государственных организаций. Выберите свою организацию в профиле.';

/** `allowed`: the player may check an officer's actions (`ai.check`); otherwise nothing is asked of the AI. */
export function useLawyerCheck(platform: PlatformAdapter, pack: ServerPack, boostDocuments?: string[], allowed = true): LawyerCheck {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LawyerAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(
    async (said: string) => {
      const text = said.trim();
      if (!text || busy) return;
      if (!allowed) {
        setError(NO_CHECK);
        return;
      }
      setBusy(true);
      setError(null);
      try {
        setResult(await checkDemands(serviceFor(await connect(platform)), pack, text, boostDocuments));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [busy, platform, pack, boostDocuments, allowed],
  );

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { busy, result, error, check, reset };
}
