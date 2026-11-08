// The officer's checks over a model that slips the format: what it meant still counts, what it did not say does not.
import { describe, expect, it, vi } from 'vitest';
import { KUTUZOVSKIY_PACK, TVERSKOI_PACK } from '../data/bundled';
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
  it('tells the AI that a lawyer acts in the criminal process: the basis is the УПК or the police law, not the КоАП', async () => {
    const provider = fakeAi((id) => ({ demands: [{ demand: 'Дать позвонить', lawful: id(/УПК ст\. 26/), basis: 'Задержанный вправе на звонок.', refusal: '' }], reply: '', note: '' }));
    await checkDemands(provider, pack, 'Адвокат требует дать задержанному позвонить');
    const { system } = vi.mocked(provider.complete).mock.calls[0][0];
    expect(system).toMatch(/уголовном процессе/);
    expect(system).toMatch(/сроку самого задержания/);
  });

  it('takes {"unlawful": "S5"} for unlawful by S5', async () => {
    const answer = await checkDemands(
      fakeAi((id) => ({ demands: [{ demand: 'Отпустить через 20 минут', unlawful: id(/6-ФЗ ст\. 14/), basis: 'Срок задержания — до часа.', refusal: 'Срок не истёк.' }], reply: '', note: '' })),
      pack,
      'Адвокат требует немедленно отпустить задержанного, прошло 20 минут',
    );
    expect(answer.demands[0]).toMatchObject({ verdict: 'unlawful', refusal: 'Срок не истёк.' });
  });
});

describe('a lawyer check with a missing fact or a conflicting verdict', () => {
  it('asks for the missing fact and suppresses instructions until it is known', async () => {
    const question = 'Задержание оформлялось письменно?';
    const answer = await checkDemands(
      fakeAi(() => ({
        demands: [{ demand: 'Показать протокол', verdict: 'unclear', question, officer: 'Показать протокол.', refusal: 'Отказать.' }],
        reply: 'Я покажу протокол.',
      })),
      pack,
      'Адвокат просит показать протокол задержания',
    );
    expect(answer.demands[0]).toMatchObject({ verdict: 'unclear', question, officer: '', refusal: '' });
    expect(answer.reply).toBe('');
  });

  it('hides a ready-to-copy reply that cites an article outside the sources', async () => {
    const answer = await checkDemands(
      fakeAi((id) => ({
        demands: [{ demand: 'Допустить к подзащитному', verdict: 'unlawful', sources: [id(/УПК ст\. 28/)] }],
        reply: 'Отказываю на основании УПК ст. 99999.',
      })),
      pack,
      'Адвокат пришёл без удостоверения адвоката и требует пустить его к подзащитному',
    );
    expect(answer.demands[0].verdict).toBe('unlawful');
    expect(answer.reply).toBe('');
    expect(answer.issues.join(' ')).toContain('99999');
  });

  it.each([[10, 'lawful'], [30, 'unclear']])('checks a lawful verdict for a wait of %i minutes', async (minutes, verdict) => {
    const answer = await checkDemands(
      fakeAi((id) => ({
        demands: [{ demand: 'Дождаться адвоката', verdict: 'lawful', sources: [id(/ПК ст\. 3\.3/)], officer: 'Ждать.' }],
        reply: 'Я подожду.',
      })),
      KUTUZOVSKIY_PACK,
      'Задержанный попросил частного адвоката, адвокат требует ждать его ' + minutes + ' минут, пока он едет',
    );
    expect(answer.demands[0].verdict).toBe(verdict);
    if (minutes === 30) {
      expect(answer.reply).toBe('');
      expect(answer.issues).toContain('Запрошенное ожидание частного адвоката превышает предел по ПК ст. 3.3');
    }
  });
});
