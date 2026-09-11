import { describe, expect, it } from 'vitest';
import { TVERSKOI_PACK } from '../data';
import { articleLabel, formatPunishment, leadPart, penalParts } from './format';
import { documentContents, searchArticles } from './search';

const labels = (query: string) =>
  searchArticles(TVERSKOI_PACK, query).map((hit) => `${hit.document.short} ${articleLabel(hit.article, hit.part)}`);

describe('search by article number (real Тверской data)', () => {
  it('finds an article by its number; an article with several punished parts gives one hit per part', () => {
    expect(labels('65').slice(0, 2)).toEqual(['УК ст. 65 ч. 1', 'УК ст. 65 ч. 2']);
    expect(labels('ук 104')).toEqual(['УК ст. 104']);
  });

  it('puts the penal codes and the organisation’s laws first for a bare number, then the same number elsewhere', () => {
    expect(labels('50').slice(0, 3)).toEqual(['УК ст. 50', 'УК ст. 50.1', 'Конституция ст. 50']);
    const police = searchArticles(TVERSKOI_PACK, '13', { boostDocuments: ['fz6', 'upk'] }).map((hit) => hit.document.short);
    expect(police.indexOf('6-ФЗ')).toBeLessThan(police.indexOf('Конституция'));
  });

  it('finds an article of any law by its alias', () => {
    expect(labels('6-фз 13')).toEqual(['6-ФЗ ст. 13']);
    expect(labels('фз6 13')).toEqual(['6-ФЗ ст. 13']);
    expect(labels('4-фкз 1')[0]).toBe('4-ФКЗ ст. 1');
    expect(labels('упк 83.1')).toEqual(['УПК ст. 83.1']);
    expect(labels('конституция 1')[0]).toBe('Конституция ст. 1');
    expect(new Set(searchArticles(TVERSKOI_PACK, 'конституция 1').map((hit) => hit.document.short))).toEqual(new Set(['Конституция']));
    expect(labels('15-фз 10.1')).toEqual(['ПДД ст. 10.1']);
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
    const docs = new Set(searchArticles(TVERSKOI_PACK, '8', { limit: 500 }).map((hit) => hit.document.short));
    for (const short of ['УК', 'КоАП', 'ПДД', 'Конституция', 'УПК', '6-ФЗ', 'Москва']) expect(docs).toContain(short);
    expect(new Set(searchArticles(TVERSKOI_PACK, 'пдд 8').map((hit) => hit.document.short))).toEqual(new Set(['ПДД']));
  });

  it('keeps to the chosen document, unless the query names another by its alias', () => {
    const inKoap = (query: string) => searchArticles(TVERSKOI_PACK, query, { document: 'koap' });
    expect(new Set(inKoap('8').map((hit) => hit.document.short))).toEqual(new Set(['КоАП']));
    expect(new Set(inKoap('скорость').map((hit) => hit.document.short))).toEqual(new Set(['КоАП']));
    expect(inKoap('ук 65').map((hit) => `${hit.document.short} ${articleLabel(hit.article, hit.part)}`)).toEqual(['УК ст. 65 ч. 1', 'УК ст. 65 ч. 2']);
  });

  it('lists a document chapter by chapter, split by punished part as in search', () => {
    const koap = TVERSKOI_PACK.documents.find((d) => d.id === 'koap')!;
    const contents = documentContents(koap);
    expect(contents.map((g) => g.chapter?.number)).toEqual(koap.chapters.map((c) => c.number).filter((n) => contents.some((g) => g.chapter?.number === n)));
    expect(contents[0].chapter?.number).toBe('1');
    const chapter8 = contents.find((g) => g.chapter?.number === '8')!;
    const labels86 = chapter8.hits.filter((hit) => hit.article.number === '8.6').map((hit) => articleLabel(hit.article, hit.part));
    expect(labels86).toEqual(['ст. 8.6 ч. 1', 'ст. 8.6 ч. 2', 'ст. 8.6 ч. 3']);
    expect(contents.flatMap((g) => g.hits).filter((hit) => !hit.part)).toHaveLength(koap.articles.filter((a) => penalParts(a).length <= 1).length);
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
