import { describe, expect, it } from 'vitest';
import { TVERSKOI_PACK } from '../data';
import { articleLabel } from './format';
import { searchArticles, type SearchHit } from './search';

const label = (hit: SearchHit) => `${hit.document.short} ${articleLabel(hit.article, hit.part)}`;
const labels = (query: string, boostDocuments?: string[]) => searchArticles(TVERSKOI_PACK, query, { boostDocuments }).map(label);

describe('search by words (real Тверской data)', () => {
  it('finds a word in any of its forms', () => {
    for (const form of ['кража', 'кражу', 'кражи', 'кражей']) {
      expect(labels(form).slice(0, 2)).toEqual(['УК ст. 65 ч. 1', 'УК ст. 65 ч. 2']);
    }
  });

  it('treats «ё» as «е»', () => {
    expect(labels('учёт')).toEqual(labels('учет'));
    expect(labels('учёт')).toContain('ПДД ст. 15.8');
  });

  it('finds the law’s term from a word players use, via the synonyms in the data', () => {
    expect(labels('ствол')[0]).toBe('УК ст. 74 ч. 1');
    expect(labels('наркота')[0]).toBe('УК ст. 75 ч. 1');
    expect(labels('теракт')[0]).toBe('УК ст. 70');
    expect(labels('мат')[0]).toBe('КоАП ст. 11.1');
    expect(labels('парковка')[0]).toBe('КоАП ст. 8.12 ч. 1');
  });

  it('every synonym in the data leads somewhere', () => {
    const dead = Object.keys(TVERSKOI_PACK.synonyms).filter((word) => !searchArticles(TVERSKOI_PACK, `${word} `).length);
    expect(dead).toEqual([]);
  });

  it('forgives a typo, but only in a word the laws do not contain', () => {
    expect(labels('крожа')[0]).toBe('УК ст. 65 ч. 1');
    expect(labels('превышене скорасти')[0]).toBe('КоАП ст. 8.6 ч. 1');
    // «кража» exists, so «край» («по правому краю») is not taken for a typo of it.
    expect(labels('кража').filter((l) => l.startsWith('ПДД'))).toEqual([]);
  });

  it('completes the word being typed', () => {
    expect(labels('краж')).toContain('УК ст. 65 ч. 1');
    expect(labels('самовольн')[0]).toBe('УК ст. 109');
  });

  it('needs every word, and narrows a multi-part article to the matching part', () => {
    expect(labels('кража группой')).toEqual(['УК ст. 65 ч. 2']);
    expect(labels('превышение скорости').slice(0, 3)).toEqual(['КоАП ст. 8.6 ч. 1', 'КоАП ст. 8.6 ч. 2', 'КоАП ст. 8.6 ч. 3']);
  });

  it('combines a number with words', () => {
    expect(labels('8.6 скорость')).toEqual(['КоАП ст. 8.6 ч. 1', 'КоАП ст. 8.6 ч. 2', 'КоАП ст. 8.6 ч. 3']);
    expect(labels('8.6 кража')).toEqual([]);
  });

  it('ranks a match in the title above a match only in the text', () => {
    const hits = searchArticles(TVERSKOI_PACK, 'взятка ');
    const inTitle = hits.map((hit) => /взятк/i.test(hit.article.title));
    expect(inTitle.slice(0, 4)).toEqual([true, true, true, true]);
    expect(inTitle.indexOf(false) === -1 || inTitle.lastIndexOf(true) < inTitle.indexOf(false)).toBe(true);
  });

  it('lifts the documents of the user’s organisation', () => {
    // «Оскорбление» is a title in both УК 104 and КоАП 5.4; the organisation decides which comes first.
    expect(labels('оскорбление ')[0]).toBe('УК ст. 104');
    expect(labels('оскорбление ', ['koap'])[0]).toBe('КоАП ст. 5.4 ч. 1');
  });
});
