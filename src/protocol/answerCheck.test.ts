// «Проверить мой ответ»: the AI explains, the checks decide — a fake AI says what the test wants, and an answer is
// «right» only when every point stands on a source it was given.
import { describe, expect, it, vi } from 'vitest';
import { TVERSKOI_PACK } from '../data';
import { answerVerdict, checkMyAnswer, type AnswerPoint } from './answerCheck';
import type { AiProvider, AiRequest } from './provider';

const pack = TVERSKOI_PACK;

/** The AI: search phrases first, then the points the test gives — with the id the theft article was given under. */
function fakeAi(points: (theft: string) => unknown[], fix = '') {
  const provider: AiProvider = {
    complete: vi.fn(async (request: AiRequest) => {
      const context = request.turns.at(-1)!.parts.map((p) => ('text' in p ? p.text : '')).join('\n');
      if (!/ОТВЕТ ИГРОКА/.test(context)) return JSON.stringify({ phrases: ['кража'] });
      const theft = context.match(/\[([SRCO]\d+)\] УК ст\. 65/)?.[1] ?? 'S1';
      return JSON.stringify({ points: points(theft), fix });
    }),
  };
  return provider;
}
const check = (provider: AiProvider, answer = 'Это кража по УК ст. 65, задержу его') =>
  checkMyAnswer({ provider, pack, situation: 'Игрок незаметно вытащил у прохожего телефон из кармана', answer });

describe('checking the player\'s answer against the base', () => {
  it('right when every point stands on a source it was given', async () => {
    const result = await check(fakeAi((theft) => [{ point: 'это кража', verdict: 'matches', why: 'Тайное хищение — кража.', sources: [theft] }]));
    expect(result.verdict).toBe('right');
    expect(result.issues).toEqual([]);
    expect(result.points[0].sources).toHaveLength(1);
  });

  it('a «matches» with no source is not confirmed — the AI cannot call an answer right on its own word', async () => {
    const result = await check(fakeAi(() => [{ point: 'это кража', verdict: 'matches', why: 'Так и есть.', sources: [] }]));
    expect(result.points[0].verdict).toBe('unconfirmed');
    expect(result.verdict).toBe('unconfirmed');
    expect(result.issues[0]).toMatch(/нет источника/);
  });

  it('an article the sources do not hold, in the explanation, makes the point not confirmed', async () => {
    const result = await check(fakeAi((theft) => [{ point: 'статья 777', verdict: 'matches', why: 'Это статья 777 УК.', sources: [theft] }]), 'Это статья 777');
    expect(result.points[0].verdict).toBe('unconfirmed');
    expect(result.issues.join(' ')).toMatch(/777/);
  });

  it('wrong when its points contradict their sources; what to change is said', async () => {
    const result = await check(
      fakeAi((theft) => [{ point: 'это грабёж', verdict: 'contradicts', why: 'Взято тайно — это кража, не грабёж.', fix: 'Квалифицировать как кражу.', sources: [theft] }], 'Это кража, а не грабёж.'),
      'Это грабёж',
    );
    expect(result.verdict).toBe('wrong');
    expect(result.points[0].fix).toBe('Квалифицировать как кражу.');
    expect(result.fix).toBe('Это кража, а не грабёж.');
  });

  it('the whole is the app\'s word, from the points', () => {
    const p = (verdict: AnswerPoint['verdict']): AnswerPoint => ({ point: 'x', verdict, why: '', fix: '', sources: [] });
    expect(answerVerdict([p('matches'), p('matches')])).toBe('right');
    expect(answerVerdict([p('matches'), p('unconfirmed')])).toBe('partly');
    expect(answerVerdict([p('matches'), p('contradicts')])).toBe('partly');
    expect(answerVerdict([p('contradicts')])).toBe('wrong');
    expect(answerVerdict([p('unconfirmed')])).toBe('unconfirmed');
    expect(answerVerdict([])).toBe('unconfirmed');
  });
});

describe('the AI\'s slips in a check', () => {
  it('a «matches» whose own explanation says the opposite is not confirmed; ids in the text are named as articles', async () => {
    const result = await check(
      fakeAi((theft) => [
        { point: 'это кража', verdict: 'matches', why: `${theft} — тайное хищение, это кража.`, sources: [theft] },
        { point: 'дать 5 лет', verdict: 'matches', why: 'Указание срока противоречит санкции.', sources: [theft] },
      ]),
      'Это кража, дать ему 5 лет',
    );
    expect(result.points[0].why).toBe('УК ст. 65 — тайное хищение, это кража.');
    expect(result.points[1].verdict).toBe('unconfirmed');
    expect(result.issues.join(' ')).toMatch(/объяснение говорит обратное/);
    expect(result.verdict).toBe('partly');
  });
});

describe('only what the player said', () => {
  it('leaves out a point the AI added of its own, and names a document once', async () => {
    const result = await check(
      fakeAi((theft) => [
        { point: 'это кража', verdict: 'matches', why: `УК ${theft}: тайное хищение.`, sources: [theft] },
        { point: 'напомнить о процедурах полиции', verdict: 'unconfirmed', why: '', sources: [] },
      ]),
      'Это кража по УК ст. 65',
    );
    expect(result.points.map((p) => p.point)).toEqual(['это кража']);
    expect(result.points[0].why).toBe('УК ст. 65: тайное хищение.');
    expect(result.verdict).toBe('right');
  });
});

it('a point repeated by the model is checked once', async () => {
  const result = await check(
    fakeAi((theft) => [
      { point: 'Это кража по УК ст. 65', verdict: 'matches', why: 'Тайное хищение — кража.', sources: [theft] },
      { point: 'это кража по УК ст. 65', verdict: 'unconfirmed', why: '', sources: [] },
    ]),
    'Это кража по УК ст. 65',
  );
  expect(result.points).toHaveLength(1);
  expect(result.verdict).toBe('right');
});
