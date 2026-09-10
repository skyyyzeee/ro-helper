import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCriminalCode } from './criminalCode';

const root = join(import.meta.dirname, '..', '..');
const text = readFileSync(join(root, 'data', 'tverskoi', 'sources', 'uk.txt'), 'utf8');
const uk = parseCriminalCode(text, 'uk');
const article = (number: string) => {
  const found = uk.articles.find((a) => a.number === number);
  if (!found) throw new Error(`ст. ${number} not parsed`);
  return found;
};

describe('Уголовный кодекс Тверского (real forum text)', () => {
  it('reads every chapter and article, and reports nothing unparsed', () => {
    expect(uk.chapters).toHaveLength(22);
    expect(uk.articles).toHaveLength(117);
    expect(uk.articles.filter((a) => a.parts.some((p) => p.punishment))).toHaveLength(66);
    expect(uk.issues).toEqual([]);
  });

  it('keeps dotted article numbers and chapter placement', () => {
    expect(uk.articles.map((a) => a.number)).toEqual(expect.arrayContaining(['50.1', '73.1', '95.1', '100.1']));
    expect(article('65').chapter).toBe('14');
    expect(uk.chapters.find((c) => c.number === '14')?.title).toBe('Преступления против собственности');
    expect(uk.chapters.find((c) => c.number === '14.1')).toBeDefined();
  });

  it('parses ст. 65 Кража: tags, stars, both parts with alternatives, and the note', () => {
    const kraja = article('65');
    expect(kraja.title).toBe('Кража');
    expect(kraja.parts).toHaveLength(2);
    expect(kraja.parts[0]).toMatchObject({
      number: '1',
      jurisdiction: ['Р', 'Ф'],
      stars: { min: 3, max: 3 },
      punishment: { alternatives: [{ kind: 'fine', max: 50000 }, { kind: 'imprisonment', months: 30 }], additional: [] },
    });
    expect(kraja.parts[0].text.startsWith('Кража, то есть тайное хищение чужого имущества')).toBe(true);
    expect(kraja.parts[1]).toMatchObject({
      number: '2',
      stars: { min: 4, max: 4 },
      punishment: { alternatives: [{ kind: 'fine', max: 90000 }, { kind: 'imprisonment', months: 40 }] },
    });
    expect(kraja.notes).toHaveLength(1);
    expect(kraja.notes[0].label).toBe('Примечание');
  });

  it('reads every fine form: «до N», «от N до M» and a fixed amount', () => {
    expect(article('55').parts[0].punishment?.alternatives[0]).toEqual({ kind: 'fine', min: 35000, max: 60000 });
    expect(article('74').parts[0].punishment?.alternatives[0]).toEqual({ kind: 'fine', min: 50000, max: 50000 });
  });

  it('handles the odd lines', () => {
    // Fine only, no stars.
    expect(article('60').parts[0]).toMatchObject({ jurisdiction: ['Р'], punishment: { alternatives: [{ kind: 'fine', min: 5000, max: 30000 }] } });
    expect(article('60').parts[0].stars).toBeUndefined();
    // Stars without a jurisdiction tag.
    expect(article('51').parts[1]).toMatchObject({ number: '2', stars: { min: 5, max: 5 } });
    expect(article('51').parts[1].jurisdiction).toBeUndefined();
    // Star range and a term set by the wanted level.
    expect(article('100.1').parts[0]).toMatchObject({
      stars: { min: 1, max: 5 },
      punishment: { alternatives: [{ kind: 'imprisonment-by-stars', monthsPerStar: 10 }] },
    });
    // Military: mandatory add-on; ст. 112 has no «наказывается».
    expect(article('108').parts[0].punishment?.additional).toEqual(['лишение воинского звания']);
    expect(article('112').parts[0].punishment?.alternatives).toEqual([{ kind: 'imprisonment', months: 40 }]);
    // Explicit part numbers after the tag.
    expect(article('113').parts.map((p) => p.number)).toEqual(['1', '2']);
  });

  it('keeps general-part structure: numbered parts with lettered points', () => {
    const kinds = article('33').parts[0];
    expect(kinds.number).toBe('1');
    expect(kinds.points.map((p) => p.letter)).toEqual(['а', 'б', 'в', 'г', 'д', 'е']);
  });

  it('puts the chapter preface and the adoption footer where they belong', () => {
    expect(uk.chapters.find((c) => c.number === '21')?.preface[0]).toBe('Понятие преступлений против военной службы');
    expect(uk.footer).toHaveLength(2);
    expect(article('113').parts).toHaveLength(2);
  });
});
