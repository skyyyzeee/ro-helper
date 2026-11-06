import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseLawText } from './lawText';

const root = join(import.meta.dirname, '..', '..');
const text = readFileSync(join(root, 'data', 'tverskoi', 'sources', 'uk.txt'), 'utf8');
const uk = parseLawText(text, 'uk', 'criminal-code');
const article = (number: string) => {
  const found = uk.articles.find((a) => a.number === number);
  if (!found) throw new Error(`ст. ${number} not parsed`);
  return found;
};

describe('Уголовный кодекс Тверского (real forum text)', () => {
  it('reads every chapter and article in the 5 November edition', () => {
    expect(uk.chapters).toHaveLength(28);
    expect(uk.articles).toHaveLength(170);
    expect(new Set(uk.issues.map((issue) => issue.article))).toEqual(new Set(['uk-153', 'uk-155']));
  });

  it('preserves numbered parts and lettered points of ст. 87 Кража', () => {
    const theft = article('87');
    expect(theft).toMatchObject({ title: 'Кража', chapter: '19' });
    expect(theft.parts.map((part) => part.number)).toEqual(['1', '2']);
    expect(theft.parts[1].points.map((point) => point.marker)).toEqual(['а', 'б']);
    expect(theft.parts[1].punishment?.alternatives).toEqual([
      { kind: 'fine', max: 90000 },
      { kind: 'imprisonment', months: 40 },
    ]);
  });

  it('reads Бандитизм under ст. 102 with federal jurisdiction and a 50-month term', () => {
    expect(article('102')).toMatchObject({ title: 'Бандитизм' });
    expect(article('102').parts[0]).toMatchObject({
      number: '1',
      jurisdiction: ['Ф'],
      stars: { min: 5, max: 5 },
      punishment: { alternatives: [{ kind: 'imprisonment', months: 50 }] },
    });
    expect(article('157').title).toBe('Посягательство на жизнь сотрудника правоохранительного органа');
  });
});

describe('УК with sanctions on the next line', () => {
  it('keeps jurisdiction, stars and punishment together for numbered and unnumbered offences', () => {
    const source = [
      'Статья 71. Убийство',
      '[Р/Ф] [★★★] Убийство -',
      'наказывается лишением свободы на срок до 30 месяцев.',
      'Статья 102. Бандитизм',
      '1. [Ф] [★★★★★] Создание банды -',
      'наказываются лишением свободы на срок до 50 месяцев.',
    ].join('\n');
    const parsed = parseLawText(source, 'uk', 'criminal-code');
    expect(parsed.issues).toEqual([]);
    expect(parsed.articles.map((article) => article.parts)).toEqual([
      [expect.objectContaining({
        number: '1', text: 'Убийство', jurisdiction: ['Р', 'Ф'], stars: { min: 3, max: 3 },
        punishment: { alternatives: [{ kind: 'imprisonment', months: 30 }], additional: [] },
      })],
      [expect.objectContaining({
        number: '1', text: 'Создание банды', jurisdiction: ['Ф'], stars: { min: 5, max: 5 },
        punishment: { alternatives: [{ kind: 'imprisonment', months: 50 }], additional: [] },
      })],
    ]);
  });
});
