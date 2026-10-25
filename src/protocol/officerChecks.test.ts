// The officer's checks over a model that slips the format: what it meant still counts, what it did not say does not.
import { describe, expect, it, vi } from 'vitest';
import { TVERSKOI_PACK } from '../data/bundled';
import { checkDemands, reviewDetention } from './officerChecks';
import type { AiProvider, AiRequest } from './provider';

const pack = TVERSKOI_PACK;

/** The AI: an answer made from the sources it was given — `make` gets the id of the first one whose label matches. */
function fakeAi(make: (id: (label: RegExp) => string) => unknown): AiProvider {
  return {
    complete: vi.fn(async (request: AiRequest) => {
      const context = request.turns.at(-1)!.parts.map((p) => ('text' in p ? p.text : '')).join('\n');
      const id = (label: RegExp) => [...context.matchAll(/\[([SRCO]\d+)\] ([^\n]+)/g)].find(([, , title]) => label.test(title))?.[1] ?? 'S99';
      return JSON.stringify(make(id));
    }),
  };
}

describe('a detention judged in a slipped format', () => {
  it('takes {"violation": "R3"} for a violation by R3 — a detention for a mask, of the rules of the state factions', async () => {
    const review = await reviewDetention(
      fakeAi((id) => ({ steps: [{ step: 'Задержал за маску', violation: id(/Правила п\. 1\.20/), basis: 'Задержание за маску запрещено.', fix: 'Не задерживать за маску.' }], missed: [], summary: '' })),
      pack,
      'Задержал игрока только за то, что он ходил в маске',
    );
    expect(review.steps[0]).toMatchObject({ verdict: 'violation', fix: 'Не задерживать за маску.' });
    expect(review.steps[0].sources).toHaveLength(1);
  });

  it('a verdict key on no source given, or two verdict keys at once, is no verdict', async () => {
    const review = await reviewDetention(
      fakeAi(() => ({ steps: [{ step: 'Задержал', violation: 'R99' }, { step: 'Обыскал', ok: 'S1', violation: 'S1', sources: ['S1'] }], missed: [], summary: '' })),
      pack,
      'Задержал игрока и обыскал',
    );
    expect(review.steps.map((s) => s.verdict)).toEqual(['unclear', 'unclear']);
  });

  it('tells the AI that a detention for a mask is the violation itself, not a step missed', async () => {
    const provider = fakeAi(() => ({ steps: [{ step: 'Задержал', verdict: 'unclear', sources: [] }], missed: [], summary: '' }));
    await reviewDetention(provider, pack, 'Задержал игрока за маску');
    const { system } = vi.mocked(provider.complete).mock.calls[0][0];
    expect(system).toMatch(/запрещён сам повод задержания \(маска, AFK\), это "violation" у шага задержания/);
  });
});

describe('a lawyer\'s demand judged in a slipped format', () => {
  it('takes {"unlawful": "S5"} for unlawful by S5', async () => {
    const answer = await checkDemands(
      fakeAi((id) => ({ demands: [{ demand: 'Отпустить через 20 минут', unlawful: id(/6-ФЗ ст\. 14/), basis: 'Срок задержания — до часа.', refusal: 'Срок не истёк.' }], reply: '', note: '' })),
      pack,
      'Адвокат требует немедленно отпустить задержанного, прошло 20 минут',
    );
    expect(answer.demands[0]).toMatchObject({ verdict: 'unlawful', refusal: 'Срок не истёк.' });
  });
});
