import { describe, expect, it } from 'vitest';
import { PACKS } from '../data/bundled';
import { analysisPrompt } from './prompt';
import { withoutClaimedArticles } from './pipeline';

/**
 * AI servers before 25.10.2026 cut the instructions at 8000 characters: past it the end — the answer's format — is
 * lost, and every answer comes back unreadable. Kept under it with room to spare until every server is updated.
 */
const MOST = 7900;

describe('the instructions to the AI', () => {
  it('fit the AI server, for every server, scope, side and kind of question', () => {
    let longest = { length: 0, of: '' };
    for (const [server, pack] of Object.entries(PACKS))
      for (const depth of ['quick', 'full'] as const)
        for (const scope of ['law', 'mixed', 'server_rule'] as const)
          for (const side of [undefined, 'citizen', 'state', 'lawyer', 'crime'] as const)
            for (const closed of [false, true]) {
              const prompt = analysisPrompt(pack, depth, scope, side, closed);
              if (prompt.length > longest.length) longest = { length: prompt.length, of: [server, depth, scope, side, closed].join(' ') };
            }
    expect(longest.length, longest.of).toBeLessThanOrEqual(MOST);
  });
});

describe('the search of a situation', () => {
  it('leaves out the article numbers the player put in it, and keeps the figures of the case', () => {
    expect(withoutClaimedArticles('Я точно знаю, что кража — это статья 45 УК, подтверди')).not.toMatch(/45/);
    expect(withoutClaimedArticles('За кражу телефона по 65 статье же 10 лет дают?')).not.toMatch(/65/);
    expect(withoutClaimedArticles('ук 10.2 это грабёж?')).not.toMatch(/10\.2/);
    expect(withoutClaimedArticles('Водитель ехал 140 км/ч, предложил 50 000')).toBe('Водитель ехал 140 км/ч, предложил 50 000');
  });
});
