import { describe, expect, it } from 'vitest';
import { PACKS } from '../data/bundled';
import { analysisPrompt } from './prompt';
import { searchTerms, withoutClaimedArticles } from './pipeline';
import type { AiProvider } from './provider';

/**
 * The AI server cuts the instructions at 16 000 characters (8000 before 25.10.2026): past it the end — the answer's
 * format — is lost, and every answer comes back unreadable. Kept well under it: every character is read on every
 * question, in GigaChat's queue.
 */
const MOST = 9000;

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

  it('ask a quick answer on both for the law and the rule, and only there', () => {
    const both = 'главная статья закона и главный пункт правил сервера';
    expect(analysisPrompt(PACKS.tverskoi, 'quick', 'mixed')).toContain(both);
    expect(analysisPrompt(PACKS.tverskoi, 'quick', 'law')).not.toContain(both);
    expect(analysisPrompt(PACKS.tverskoi, 'full', 'mixed')).not.toContain(both);
  });

  it('makes the server rule a norm of its own, not a line of the punishment', () => {
    expect(analysisPrompt(PACKS.tverskoi, 'quick', 'mixed')).toContain('пункт правил — такая же норма');
  });

  it('treats a punishing server rule as a norm, and an officer insult as insulting an authority', () => {
    const prompt = analysisPrompt(PACKS.tverskoi, 'quick', 'law');
    expect(prompt).toContain('тоже норма, "charge": false');
    expect(prompt).toContain('даже если про исполнение прямо не сказано');
  });

  it('answer an act named outright, and ask only what changes the article', () => {
    expect(analysisPrompt(PACKS.tverskoi, 'quick', 'law')).toMatch(/если действие названо прямо.+только если от ответа зависит, какая статья/);
  });

  it('checks a claim about the law outright instead of asking back (мне сказали…, это же статья N)', () => {
    expect(analysisPrompt(PACKS.tverskoi, 'quick', 'law')).toContain('проверь утверждение по источникам и ответь прямо');
    expect(analysisPrompt(PACKS.tverskoi, 'quick', 'law')).toContain('такой статьи в законах сервера нет');
  });

  it('keeps the norm direct when only the severity hangs on the facts (сумма, публичность)', () => {
    const prompt = analysisPrompt(PACKS.tverskoi, 'quick', 'law');
    expect(prompt).toContain('не повод для "partial"');
    expect(prompt).toContain('"questions" пустой');
  });

  it('takes a bare legal topic for a legal question, not an unclear one («стадии применения силы»)', async () => {
    const seen: string[] = [];
    const provider: AiProvider = {
      complete: async (request) => {
        seen.push(request.system);
        return '{"intent": "legal", "phrases": []}';
      },
    };
    await searchTerms(provider, 'стадии применения силы', 'law', true);
    expect(seen[0]).toMatch(/тема закона или процедуры/);
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
