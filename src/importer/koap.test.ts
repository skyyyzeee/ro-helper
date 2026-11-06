import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseLawText } from './lawText';

const root = join(import.meta.dirname, '..', '..');
const text = readFileSync(join(root, 'data', 'tverskoi', 'sources', 'koap.txt'), 'utf8');
const koap = parseLawText(text, 'koap', 'administrative-code');
const article = (number: string) => {
  const found = koap.articles.find((a) => a.number === number);
  if (!found) throw new Error(`ст. ${number} not parsed`);
  return found;
};
const part = (number: string, partNumber?: string) => {
  const a = article(number);
  const found = partNumber ? a.parts.find((p) => p.number === partNumber) : a.parts.find((p) => p.punishment);
  if (!found) throw new Error(`ст. ${number} ч. ${partNumber} not parsed`);
  return found;
};

describe('КоАП Тверского (real forum text)', () => {
  it('reads every chapter and article; every «влечет» line becomes a sanction', () => {
    expect(koap.chapters).toHaveLength(21);
    expect(koap.articles).toHaveLength(150);
    const sanctionLines = text.split('\n').filter((line) => /^\s*(влеч[её]т|влекут)\s/.test(line)).length;
    expect(koap.articles.flatMap((a) => a.parts.filter((p) => p.punishment))).toHaveLength(sanctionLines);
    expect(koap.header).toEqual(['КОДЕКС РОССИЙСКОГО ОКРУГА', 'ОБ АДМИНИСТРАТИВНЫХ ПРАВОНАРУШЕНИЯХ']);
    expect(koap.footer).toEqual([]);
  });

  it('reads every sanction of the edition of 6 November, with no fix by hand', () => {
    expect(koap.issues).toEqual([]);
  });

  it('parses ст. 9.8 speeding: three numbered parts with growing fines', () => {
    expect(article('9.8').parts.map((p) => p.number)).toEqual(['1', '2', '3']);
    expect(part('9.8', '1').text).toBe('Превышение установленной скорости движения транспортного средства на величину более 20 км/ч');
    expect(part('9.8', '1').punishment).toEqual({ alternatives: [{ kind: 'fine', max: 10000 }], additional: [] });
    expect(part('9.8', '3').punishment?.alternatives).toEqual([{ kind: 'fine', max: 35000 }, { kind: 'license-revocation' }]);
  });

  it('splits amounts by who they apply to', () => {
    expect(part('5.5', '1').punishment?.alternatives).toEqual([
      { kind: 'fine', min: 10000, max: 25000, subject: 'citizen' },
      { kind: 'arrest', max: 20, subject: 'citizen' },
      { kind: 'fine', min: 30000, max: 50000, subject: 'official' },
      { kind: 'arrest', max: 20, subject: 'official' },
      { kind: 'fine', min: 25000, max: 100000, subject: 'legal' },
    ]);
    // A warning named before the subject applies to that subject too.
    expect(part('5.1', '1').punishment?.alternatives.slice(0, 2)).toEqual([
      { kind: 'warning', subject: 'official' },
      { kind: 'fine', min: 25000, max: 75000, subject: 'official' },
    ]);
    // Subject at the end of the line.
    expect(part('11.2', '2').punishment?.alternatives).toEqual([
      { kind: 'fine', min: 20000, max: 40000, subject: 'official' },
      { kind: 'fine', min: 50000, max: 500000, subject: 'legal' },
    ]);
  });

  it('reads the other sanction forms', () => {
    // Stars before the part number.
    expect(part('9.6', '2')).toMatchObject({ stars: { min: 2, max: 2 }, punishment: { alternatives: [{ kind: 'fine', min: 30000, max: 50000 }, { kind: 'arrest', max: 20 }] } });
    // Warning first, then a fine and an arrest.
    expect(part('12.2').punishment?.alternatives).toEqual([
      { kind: 'warning' },
      { kind: 'fine', min: 5000, max: 15000 },
      { kind: 'arrest', max: 10 },
    ]);
    // Arrest named before the fine.
    expect(part('12.5', '1').punishment?.alternatives).toEqual([{ kind: 'arrest', max: 20 }, { kind: 'fine', max: 20000 }]);
    // «и (или) лишение права управления»: the fine and the revocation are both on offer.
    expect(part('9.24', '1').punishment?.alternatives).toEqual([{ kind: 'fine', min: 20000, max: 50000 }, { kind: 'license-revocation' }]);
    // «штраф … и лишение …, либо арест … и лишение …»: the revocation goes with either.
    expect(part('9.7', '3').punishment).toEqual({ alternatives: [{ kind: 'fine', min: 20000, max: 30000 }, { kind: 'arrest', max: 20 }], additional: ['лишение права управления ТС'] });
  });

  it('keeps offence text clean and notes and points read', () => {
    expect(part('5.5', '1').text.startsWith('Оскорбление, то есть унижение чести и достоинства другого лица')).toBe(true);
    expect(part('5.5', '1').stars).toEqual({ min: 2, max: 2 });
    expect(article('9.7').title).toBe('Управление транспортным средством водителем, находящимся в состоянии опьянения, передача управления транспортным средством лицу, находящемуся в состоянии опьянения');
    expect(article('9.7').notes.map((n) => n.label)).toEqual(['Примечание']);
    expect(article('18.3').parts[0].points.map((p) => p.marker)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
  });
});
