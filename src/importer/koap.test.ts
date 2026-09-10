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
    expect(koap.chapters).toHaveLength(19);
    expect(koap.articles).toHaveLength(136);
    const sanctionLines = text.split('\n').filter((line) => /^\s*(влеч[её]т|влекут)\s/.test(line)).length;
    expect(koap.articles.flatMap((a) => a.parts.filter((p) => p.punishment))).toHaveLength(sanctionLines);
    expect(koap.header).toEqual(['КОДЕКС РО', 'ОБ АДМИНИСТРАТИВНЫХ ПРАВОНАРУШЕНИЯХ']);
    expect(koap.footer).toHaveLength(2);
  });

  it('reports only КоАП 8.17, the one sanction the parser cannot read (fixed by hand in overrides.json)', () => {
    expect(koap.issues).toHaveLength(1);
    expect(koap.issues[0]).toMatchObject({ article: 'koap-8.17', partIndex: 1 });
  });

  it('parses ст. 8.6 speeding: three numbered parts with growing fines', () => {
    expect(article('8.6').parts.map((p) => p.number)).toEqual(['1', '2', '3']);
    expect(part('8.6', '1').text).toBe('Превышение установленной скорости движения транспортного средства на величину более 15 км/ч');
    expect(part('8.6', '1').punishment).toEqual({ alternatives: [{ kind: 'fine', max: 10000 }], additional: [] });
    expect(part('8.6', '3').punishment?.alternatives).toEqual([{ kind: 'fine', max: 35000 }, { kind: 'license-revocation' }]);
  });

  it('splits amounts by who they apply to', () => {
    expect(part('5.4', '1').punishment?.alternatives).toEqual([
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
    expect(part('10.6', '2').punishment?.alternatives).toEqual([{ kind: 'fine', max: 500000, subject: 'legal' }]);
  });

  it('reads the other sanction forms', () => {
    // Arrest written in words, stars before the part number.
    expect(part('8.5', '2')).toMatchObject({ stars: { min: 2, max: 2 }, punishment: { alternatives: [{ kind: 'fine', min: 30000, max: 50000 }, { kind: 'arrest', max: 15 }] } });
    // A fixed arrest term, warning first.
    expect(part('11.6').punishment?.alternatives).toEqual([
      { kind: 'warning' },
      { kind: 'fine', min: 5000, max: 15000 },
      { kind: 'arrest', min: 10, max: 10 },
    ]);
    // Arrest named before the fine.
    expect(part('11.4', '1').punishment?.alternatives).toEqual([{ kind: 'arrest', max: 20 }, { kind: 'fine', max: 20000 }]);
    // A multiple of the unpaid fine.
    expect(part('10.2').punishment?.alternatives[0]).toEqual({ kind: 'fine-multiple', multiplier: 2, min: 3000 });
    // «и/или эвакуацию» and a mandatory suspension.
    expect(part('8.21').punishment?.alternatives).toEqual([{ kind: 'fine', min: 1500, max: 10000 }, { kind: 'evacuation' }]);
    expect(part('10.5', '2').punishment?.additional).toEqual(['приостановление деятельности юрлица до 3 мес']);
  });

  it('keeps offence text clean and notes numbered', () => {
    expect(part('6.1').text.endsWith('если эти действия не содержат уголовно наказуемого деяния')).toBe(true);
    expect(part('6.1').stars).toEqual({ min: 2, max: 2 });
    expect(article('8.17').title).toBe('Неуплата штрафов, выданных на автотранспортное средство');
    expect(article('11.5').notes.map((n) => n.label)).toEqual(['Примечание 1']);
    expect(article('16.2.1').parts[0].points.map((p) => p.marker)).toEqual(['а', 'б', 'в', 'г', 'д', 'е', 'ж', 'з', 'з']);
  });
});
