// «Разбор задержания» (issue #4): after a detention the officer tells, in their own words, what they did, step by
// step, and gets each step checked against the server's laws and the project's rules for the state's factions — done
// right, a violation, or nothing in them — what was missed, and a summary: self-study for the academy. Nothing is
// recorded: the officer tells it themselves (typed, or with 🎤), so no other player's voice is ever taken. The review
// itself is protocol/officerChecks.ts, which the exam asks too.
import { useCallback, useState } from 'react';
import type { ServerPack } from '../core';
import { reviewDetention, type DetentionReview } from '../protocol/officerChecks';
import type { PlatformAdapter } from '../platform/types';
import { connect, serviceFor } from './ai';
import { NO_CHECK } from './lawyer';

export { grounded, type DetentionReview, type DetentionStep, type MissedStep, type StepVerdict } from '../protocol/officerChecks';

export interface DetentionCheck {
  busy: boolean;
  result: DetentionReview | null;
  error: string | null;
  review: (said: string) => Promise<void>;
  reset: () => void;
}

/** `allowed`: the player may check an officer's actions (`ai.check`); otherwise nothing is asked of the AI. */
export function useDetentionReview(platform: PlatformAdapter, pack: ServerPack, boostDocuments?: string[], allowed = true): DetentionCheck {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DetentionReview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const review = useCallback(
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
        setResult(await reviewDetention(serviceFor(await connect(platform)), pack, text, boostDocuments));
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

  return { busy, result, error, review, reset };
}
