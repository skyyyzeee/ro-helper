import { describe, expect, it } from 'vitest';
import { ARBATSKIY_PACK, TVERSKOI_PACK } from '../data/bundled';
import { articleLabel, formatPunishment } from './format';
import { OPTIONS, quizRound, seeded } from './quiz';

describe('practice with no AI (roadmap 6А)', () => {
  const round = quizRound(TVERSKOI_PACK, ['uk', 'koap'], 30, seeded(7));

  it('makes the round asked for, the three kinds in turn, an article asked once', () => {
    expect(round).toHaveLength(30);
    expect(new Set(round.map((q) => q.kind))).toEqual(new Set(['number', 'title', 'punishment']));
    expect(new Set(round.map((q) => q.hit.article.id)).size).toBe(30);
  });

  it('gives four different answers, the right one the law’s own', () => {
    for (const q of round) {
      expect(q.options).toHaveLength(OPTIONS);
      expect(new Set(q.options).size).toBe(OPTIONS);
      const right = q.options[q.answer];
      const { article, document, part } = q.hit;
      if (q.kind === 'number') expect(right).toBe(`${document.short} ${articleLabel(article, undefined, document.unit)}`);
      if (q.kind === 'title') expect(right).toBe(article.title);
      if (q.kind === 'punishment') expect(right).toBe(formatPunishment(part!.punishment!));
      // The others are of the same document: no other code's articles in a question on УК.
      if (q.kind === 'number') expect(q.options.every((o) => o.startsWith(`${document.short} `))).toBe(true);
    }
  });

  it('asks about the documents chosen only, of the player’s own server', () => {
    const arbatskiy = quizRound(ARBATSKIY_PACK, ['uk'], 10, seeded(3));
    expect(arbatskiy.every((q) => q.hit.document.id === 'uk' && ARBATSKIY_PACK.documents.includes(q.hit.document))).toBe(true);
  });

  it('is the same for the same seed, and fewer questions where the documents have too little to ask', () => {
    expect(quizRound(TVERSKOI_PACK, ['uk'], 10, seeded(1))).toEqual(quizRound(TVERSKOI_PACK, ['uk'], 10, seeded(1)));
    expect(quizRound(TVERSKOI_PACK, ['no-such-document'], 10)).toEqual([]);
  });
});
