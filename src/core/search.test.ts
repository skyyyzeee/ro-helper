import { describe, expect, it } from 'vitest';
import { TVERSKOI_PACK } from '../data';
import { formatPunishment, leadPart } from './format';
import { searchArticles } from './search';

const numbers = (query: string) => searchArticles(TVERSKOI_PACK, query).map((hit) => `${hit.document.short} ${hit.article.number}`);

describe('search by article number (real Тверской data)', () => {
  it('finds an article by its number', () => {
    expect(numbers('65')[0]).toBe('УК 65');
  });

  it('accepts a document alias and «ст.» before the number', () => {
    expect(numbers('ук 65')[0]).toBe('УК 65');
    expect(numbers('УК ст. 65')[0]).toBe('УК 65');
  });

  it('ranks the exact number above its sub-articles and above numbers that only start with it', () => {
    expect(numbers('50').slice(0, 2)).toEqual(['УК 50', 'УК 50.1']);
    expect(numbers('73').slice(0, 2)).toEqual(['УК 73', 'УК 73.1']);
    expect(numbers('6')[0]).toBe('УК 6');
    expect(numbers('6')).toContain('УК 65');
  });

  it('returns nothing for an empty query, a bare alias or an unknown document', () => {
    expect(numbers('')).toEqual([]);
    expect(numbers('ук')).toEqual([]);
    expect(numbers('коап 65')).toEqual([]);
  });

  it('summarises the lead part’s punishment', () => {
    const [hit] = searchArticles(TVERSKOI_PACK, '65');
    expect(formatPunishment(leadPart(hit.article)!.punishment!)).toBe('штраф до 50 000 ₽ либо 30 мес');
  });
});
