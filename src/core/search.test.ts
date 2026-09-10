import { describe, expect, it } from 'vitest';
import { TVERSKOI_PACK } from '../data';
import { articleLabel, formatPunishment, leadPart } from './format';
import { searchArticles } from './search';

const labels = (query: string) =>
  searchArticles(TVERSKOI_PACK, query).map((hit) => `${hit.document.short} ${articleLabel(hit.article, hit.part)}`);

describe('search by article number (real Тверской data)', () => {
  it('finds an article by its number; an article with several punished parts gives one hit per part', () => {
    expect(labels('65').slice(0, 2)).toEqual(['УК ст. 65 ч. 1', 'УК ст. 65 ч. 2']);
    expect(labels('104')).toEqual(['УК ст. 104']);
  });

  it('accepts a document alias and «ст.» before the number', () => {
    expect(labels('ук 65')).toEqual(['УК ст. 65 ч. 1', 'УК ст. 65 ч. 2']);
    expect(labels('УК ст. 65')[0]).toBe('УК ст. 65 ч. 1');
    expect(labels('коап 8.6')).toEqual(['КоАП ст. 8.6 ч. 1', 'КоАП ст. 8.6 ч. 2', 'КоАП ст. 8.6 ч. 3']);
    expect(labels('пдд 10.1')).toEqual(['ПДД ст. 10.1']);
  });

  it('narrows to one part with «ч N», «ч. N», «часть N» or «ч1»', () => {
    expect(labels('коап 8.6 ч 1')).toEqual(['КоАП ст. 8.6 ч. 1']);
    expect(labels('8.6 ч. 2')).toEqual(['КоАП ст. 8.6 ч. 2']);
    expect(labels('ук 65 часть 2')).toEqual(['УК ст. 65 ч. 2']);
    expect(labels('коап 8.6 ч3')).toEqual(['КоАП ст. 8.6 ч. 3']);
    expect(labels('коап 8.6 ч 7')).toEqual([]);
  });

  it('ranks the exact number above its sub-articles and above numbers that only start with it', () => {
    expect(labels('50').slice(0, 2)).toEqual(['УК ст. 50', 'УК ст. 50.1']);
    expect(labels('ук 73').slice(0, 2)).toEqual(['УК ст. 73', 'УК ст. 73.1']);
    expect(labels('ук 6')[0]).toBe('УК ст. 6');
    expect(labels('ук 6')).toContain('УК ст. 65 ч. 1');
  });

  it('searches every document unless an alias narrows it', () => {
    const docs = new Set(searchArticles(TVERSKOI_PACK, '8').map((hit) => hit.document.short));
    expect(docs).toEqual(new Set(['УК', 'КоАП', 'ПДД']));
    expect(new Set(searchArticles(TVERSKOI_PACK, 'пдд 8').map((hit) => hit.document.short))).toEqual(new Set(['ПДД']));
  });

  it('returns nothing for an empty query, a bare alias or a number that does not exist', () => {
    expect(labels('')).toEqual([]);
    expect(labels('ук')).toEqual([]);
    expect(labels('коап 65')).toEqual([]);
  });

  it('summarises a punishment for a citizen, naming the subject when only others are punished', () => {
    const [kraja] = searchArticles(TVERSKOI_PACK, 'ук 65 ч 1');
    expect(formatPunishment(kraja.part!.punishment!)).toBe('штраф до 50 000 ₽ либо 30 мес');
    const [insult] = searchArticles(TVERSKOI_PACK, 'коап 5.4 ч 1');
    expect(formatPunishment(insult.part!.punishment!)).toBe('штраф от 10 000 до 25 000 ₽ либо арест до 20 сут');
    const [slander] = searchArticles(TVERSKOI_PACK, 'коап 5.5');
    expect(formatPunishment(leadPart(slander.article)!.punishment!)).toBe('юридическим лицам: штраф от 100 000 до 200 000 ₽');
  });
});
